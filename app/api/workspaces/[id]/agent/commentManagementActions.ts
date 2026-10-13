import { listBoardComments, manageBoardComment, type CommentAccessRole } from "@/lib/workspace/comment-management";
import type { WorkspaceCommentStore } from "@/lib/workspace/comment-store";
import type { JsonMap } from "./routeHelpers";

export const COMMENT_COMMANDS = new Set(["add_comment", "list_comments", "edit_comment", "resolve_comment", "reopen_comment", "delete_comment"]);

export async function applyCommentManagementAction(
  boardId: string, email: string, role: CommentAccessRole, action: JsonMap, store?: WorkspaceCommentStore,
) {
  const params = action.params && typeof action.params === "object" ? action.params as JsonMap : {};
  const field = (key: string) => action[key] ?? params[key];
  if (action.type === "list_comments") {
    const blockId = field("blockId");
    const comments = await listBoardComments(boardId, typeof blockId === "string" ? blockId : undefined, store);
    return { ok: true as const, comments, ids: comments.map((comment) => comment.id), changed: false };
  }
  const commentId = field("commentId");
  if (typeof commentId !== "string" || !commentId.trim()) return { ok: false as const, status: 400, error: "Exact commentId required; use list_comments first" };
  const mutation = action.type === "edit_comment" ? { body: field("body") }
    : action.type === "delete_comment" ? { delete: true as const }
    : { resolved: action.type === "resolve_comment" };
  const result = await manageBoardComment(boardId, commentId, email, role, mutation, store);
  return result.ok ? { ...result, comments: [result.comment], ids: [commentId] } : result;
}
