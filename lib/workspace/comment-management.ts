import { prisma } from "@/lib/prisma";
import { sameWorkspaceIdentity } from "./identity";
import type { WorkspaceCommentStore } from "./comment-store";

export type CommentAccessRole = "OWNER" | "EDITOR" | "VIEWER";
type Mutation = { body: unknown } | { resolved: unknown } | { delete: true };

export async function manageBoardComment(
  boardId: string, commentId: string, email: string, role: CommentAccessRole, mutation: Mutation,
  store: WorkspaceCommentStore = prisma,
) {
  const comment = await store.workspaceBoardComment.findUnique({ where: { id: commentId } });
  if (!comment || comment.boardId !== boardId) return { ok: false as const, status: 404, error: "Comment not found" };
  const isAuthor = sameWorkspaceIdentity(comment.authorEmail, email);
  if ("body" in mutation) {
    if (!isAuthor) return { ok: false as const, status: 403, error: "Only the author may edit" };
    if (typeof mutation.body !== "string" || !mutation.body.trim()) {
      return { ok: false as const, status: 400, error: "body must be non-empty" };
    }
    if (mutation.body.length > 10_000) return { ok: false as const, status: 413, error: "Comment is too long" };
    const body = mutation.body.trim();
    const changed = body !== comment.body;
    const updated = changed ? await store.workspaceBoardComment.update({ where: { id: commentId }, data: { body } }) : comment;
    return { ok: true as const, comment: updated, changed };
  }
  if (!isAuthor && role === "VIEWER") return { ok: false as const, status: 403, error: "Read-only access" };
  if ("delete" in mutation) {
    await store.workspaceBoardComment.delete({ where: { id: commentId } });
    return { ok: true as const, comment, changed: true };
  }
  if (typeof mutation.resolved !== "boolean") return { ok: false as const, status: 400, error: "resolved (boolean) required" };
  const changed = mutation.resolved !== comment.resolved;
  const updated = changed ? await store.workspaceBoardComment.update({ where: { id: commentId }, data: { resolved: mutation.resolved } }) : comment;
  return { ok: true as const, comment: updated, changed };
}

export function listBoardComments(boardId: string, blockId?: string, store: WorkspaceCommentStore = prisma) {
  return store.workspaceBoardComment.findMany({ where: { boardId, ...(blockId ? { blockId } : {}) }, orderBy: { createdAt: "asc" } });
}
