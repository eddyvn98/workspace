import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../../_auth";
import { resolveAccessRole } from "../../_access";
import { createBoardComment } from "@/lib/workspace/comment-repository";

/** GET /api/workspaces/[id]/comments — every comment on the board (all
 *  blocks), for any collaborator (owner/EDITOR/VIEWER — commenting, unlike
 *  editing content, doesn't require write access). Client groups by blockId. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await resolveAccessRole(board, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const comments = await prisma.workspaceBoardComment.findMany({
    where: { boardId: params.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(comments);
}

/** POST /api/workspaces/[id]/comments — add a comment to a block. Any
 *  collaborator (including VIEWER) may comment. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await resolveAccessRole(board, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { blockId, body, parentId } = await req.json();
  const result = await createBoardComment(board, email, { blockId, body, parentId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const comment = result.comment;

  return NextResponse.json(comment, { status: 201 });
}
