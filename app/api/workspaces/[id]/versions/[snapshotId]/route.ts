import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../../../_auth";
import { resolveAccessRole } from "../../../_access";

type RouteParams = { params: { id: string; snapshotId: string } };

/** GET /api/workspaces/[boardId]/versions/[snapshotId] — read-only snapshot detail for preview. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await resolveAccessRole(board, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snapshot = await prisma.workspaceBoardSnapshot.findUnique({
    where: { id: params.snapshotId },
    select: {
      id: true,
      boardId: true,
      label: true,
      createdBy: true,
      createdAt: true,
      blocks: true,
      blockOrder: true,
      connectors: true,
    },
  });
  if (!snapshot || snapshot.boardId !== params.id) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  return NextResponse.json({ snapshot });
}
