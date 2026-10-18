import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { commitBoardContent } from "@/lib/workspace/boardCommit";
import { sameWorkspaceIdentity } from "@/lib/workspace/identity";
import { DEFAULT_CAMERA } from "@/app/workspace/types/camera";
import { resolveWorkspaceCallerEmail } from "@/app/api/workspaces/_auth";
import { type WorkspaceAccessRole } from "@/app/api/workspaces/_access";
import { createOfficeBlock } from "@/lib/office/factory";
import { OFFICE_KINDS, listOfficeFilesFromBoard, officeEditorUrl, type OfficeKind } from "@/lib/office/catalog";

export async function GET(req: NextRequest) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const boards = await prisma.workspaceBoard.findMany({
    where: { OR: [
      { ownerEmail: { equals: email, mode: "insensitive" } },
      { shares: { some: { invitedEmail: { equals: email, mode: "insensitive" } } } },
    ] },
    select: {
      id: true, title: true, updatedAt: true, ownerEmail: true, blocks: true, blockOrder: true,
      shares: {
        where: { invitedEmail: { equals: email, mode: "insensitive" } },
        select: { role: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  const files = boards.flatMap((board) => {
    const viewerRole: WorkspaceAccessRole | undefined = sameWorkspaceIdentity(board.ownerEmail, email)
      ? "OWNER" : board.shares[0]?.role;
    return viewerRole ? listOfficeFilesFromBoard(board, viewerRole) : [];
  });
  return NextResponse.json(files, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload: unknown = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Invalid Office file request" }, { status: 400 });
  }
  const { kind, title } = payload as Record<string, unknown>;
  if (typeof kind !== "string" || !OFFICE_KINDS.includes(kind as OfficeKind)
      || typeof title !== "string" || !title.trim() || title.trim().length > 120) {
    return NextResponse.json({ error: "A valid file type and title (1-120 characters) are required" }, { status: 400 });
  }
  const name = title.trim();
  const boardId = randomUUID();
  const block = createOfficeBlock(kind as OfficeKind, name);
  const outcome = await commitBoardContent({
    boardId, actorEmail: email, existing: null, baseRevision: null, editEvents: [],
    content: {
      title: name,
      blocks: { [block.id]: block } as unknown as Prisma.InputJsonValue,
      blockOrder: [block.id],
      connectors: {},
      camera: DEFAULT_CAMERA as unknown as Prisma.InputJsonValue,
      frames: [],
    },
  });
  if (!("board" in outcome)) {
    return NextResponse.json({ error: "Unable to create Office file" }, { status: 409 });
  }
  return NextResponse.json({
    boardId, blockId: block.id, kind, title: name,
    url: officeEditorUrl(kind as OfficeKind, boardId, block.id),
  }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
