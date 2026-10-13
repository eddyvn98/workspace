import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../../../_auth";
import { resolveAccessRole } from "../../../_access";
import { manageBoardComment } from "@/lib/workspace/comment-management";

async function loadRole(boardId: string, email: string) {
  const board = await prisma.workspaceBoard.findUnique({ where: { id: boardId } });
  if (!board) return null;
  const role = await resolveAccessRole(board, email);
  if (!role) return null;
  return role;
}

/** PATCH /api/workspaces/[id]/comments/[commentId] — edit or toggle resolved. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } },
) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await loadRole(params.id, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const payload = await req.json();
  const mutation = typeof payload.body === "string" ? { body: payload.body } : { resolved: payload.resolved };
  const result = await manageBoardComment(params.id, params.commentId, email, role, mutation);
  return result.ok ? NextResponse.json(result.comment) : NextResponse.json({ error: result.error }, { status: result.status });
}

/** DELETE /api/workspaces/[id]/comments/[commentId] — the comment's author,
 *  the board owner, or an EDITOR collaborator (moderation). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } },
) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await loadRole(params.id, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await manageBoardComment(params.id, params.commentId, email, role, { delete: true });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
