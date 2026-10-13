import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../../_auth";
import { resolveAccessRole } from "../../_access";

type RouteParams = { params: { id: string } };

/**
 * GET /api/workspaces/[boardId]/versions — list snapshots for a board (newest first,
 * id/label/createdBy/createdAt only — omit JSON blob columns from list response).
 * Read-access-gated (owner/EDITOR/VIEWER).
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await resolveAccessRole(board, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const snapshots = await prisma.workspaceBoardSnapshot.findMany({
    where: { boardId: params.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      boardId: true,
      label: true,
      createdBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json(snapshots);
}

/**
 * POST /api/workspaces/[boardId]/versions — create a manual "save version" checkpoint
 * from the board's currently persisted Postgres row (blocks/blockOrder/connectors).
 * Write-access-gated (VIEWER cannot save a version).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await resolveAccessRole(board, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "VIEWER") {
    return NextResponse.json({ error: "Viewer role cannot save a version" }, { status: 403 });
  }

  let label: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.label === "string" && body.label.trim()) {
      label = body.label.trim();
    }
  } catch {
    // optional body
  }

  // Manual snapshots are the user's own bookmarks and are deliberately never
  // pruned (see autoCheckpoint.ts) — but with no rate limit at all, a buggy
  // client retry loop or a scripted caller could still create unbounded rows,
  // each a full copy of the board's JSON. A short cooldown bounds that
  // without touching the "keep forever" guarantee a real save deserves.
  const MIN_MANUAL_SNAPSHOT_INTERVAL_MS = 3_000;
  const lastManual = await prisma.workspaceBoardSnapshot.findFirst({
    where: { boardId: params.id, label: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastManual && Date.now() - lastManual.createdAt.getTime() < MIN_MANUAL_SNAPSHOT_INTERVAL_MS) {
    return NextResponse.json({ error: "Please wait a moment before saving another version" }, { status: 429 });
  }

  const snapshot = await prisma.workspaceBoardSnapshot.create({
    data: {
      boardId: board.id,
      blocks: board.blocks as any,
      blockOrder: board.blockOrder as any,
      connectors: board.connectors as any,
      label,
      createdBy: email,
    },
    select: {
      id: true,
      boardId: true,
      label: true,
      createdBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json(snapshot, { status: 201 });
}
