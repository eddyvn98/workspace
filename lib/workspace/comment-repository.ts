import { prisma } from "@/lib/prisma";
import type { WorkspaceCommentStore } from "./comment-store";
import { notifyBoardCollaborators } from "@/app/api/workspaces/_notify";
import { sameWorkspaceIdentity } from "@/lib/workspace/identity";

const MAX_COMMENT_LENGTH = 10_000;

export type CreateCommentResult =
  | { ok: true; comment: { id: string; blockId: string; body: string; [key: string]: unknown }; notification: CommentCreatedNotification }
  | { ok: false; status: 400 | 413; error: string };

export interface CommentCreatedNotification {
  boardId: string;
  boardTitle: string;
  email: string;
  blockId: string;
  commentId: string;
  parentAuthor: string | null;
}

export function notifyCreatedBoardComment(notification: CommentCreatedNotification): void {
  const { boardId, boardTitle, email, blockId, commentId, parentAuthor } = notification;
  const anchor = { blockId, commentId, actorEmail: email };
  if (parentAuthor) {
    void notifyBoardCollaborators(
      boardId,
      email,
      "REPLY",
      `${email} replied to you on "${boardTitle}"`,
      anchor,
      [parentAuthor],
    );
  }
  void notifyBoardCollaborators(
    boardId,
    parentAuthor ? [email, parentAuthor] : email,
    "NEW_COMMENT",
    `${email} commented on "${boardTitle}"`,
    anchor,
  );
}

/**
 * Adds a comment (or one-level reply) to a block and notifies collaborators.
 * Shared by the REST route and the AI `add_comment` command so both apply the
 * same validation and produce the same bell notifications. The caller has
 * already resolved that `email` may access the board; commenting needs no
 * write access.
 */
export async function createBoardComment(
  board: { id: string; title: string },
  email: string,
  input: { blockId: unknown; body: unknown; parentId?: unknown },
  store: WorkspaceCommentStore = prisma,
  options: { notify?: boolean } = {},
): Promise<CreateCommentResult> {
  const { blockId, body, parentId } = input;
  if (typeof blockId !== "string" || !blockId || typeof body !== "string" || !body.trim()) {
    return { ok: false, status: 400, error: "blockId and non-empty body required" };
  }
  if (body.length > MAX_COMMENT_LENGTH) return { ok: false, status: 413, error: "Comment is too long" };

  let validParentId: string | null = null;
  let parentAuthor: string | null = null;
  if (typeof parentId === "string" && parentId) {
    const parent = await store.workspaceBoardComment.findUnique({ where: { id: parentId } });
    // One level deep only: the parent must exist, belong to the same board
    // and block, and not itself be a reply.
    if (!parent || parent.boardId !== board.id || parent.blockId !== blockId || parent.parentId) {
      return { ok: false, status: 400, error: "Invalid parentId" };
    }
    validParentId = parentId;
    // Replying to yourself is not a notification. Compared case-insensitively
    // because the stored author can spell the same person differently.
    parentAuthor = sameWorkspaceIdentity(parent.authorEmail, email) ? null : parent.authorEmail;
  }

  const comment = await store.workspaceBoardComment.create({
    data: { boardId: board.id, blockId, authorEmail: email, body: body.trim(), parentId: validParentId },
  });
  const notification = {
    boardId: board.id,
    boardTitle: board.title,
    email,
    blockId,
    commentId: comment.id,
    parentAuthor,
  };
  if (options.notify !== false) notifyCreatedBoardComment(notification);
  return { ok: true, comment, notification };
}
