import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeCommandReceipt, type CommandReceiptKey } from "@/lib/workspace/commandReceipts";
import type { WorkspaceCommentStore } from "@/lib/workspace/comment-store";
import { applyCommentManagementAction, COMMENT_COMMANDS } from "./commentManagementActions";
import type { CommentAccessRole } from "@/lib/workspace/comment-management";
import { createBoardComment, notifyCreatedBoardComment, type CommentCreatedNotification } from "@/lib/workspace/comment-repository";
import { list, textOf, type JsonMap } from "./routeHelpers";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function field(action: JsonMap, key: string): unknown {
  const params = action.params && typeof action.params === "object" ? action.params as JsonMap : {};
  return action[key] ?? params[key];
}

function commentSummary(type: string, comment: unknown): string | undefined {
  if (!comment || typeof comment !== "object" || Array.isArray(comment)) return undefined;
  const body = (comment as { body?: unknown }).body;
  const excerpt = typeof body === "string" ? body.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (!excerpt) return undefined;
  if (type === "add_comment") return `added comment "${excerpt}"`;
  if (type === "edit_comment") return `edited comment to "${excerpt}"`;
  if (type === "resolve_comment") return `resolved comment "${excerpt}"`;
  if (type === "reopen_comment") return `reopened comment "${excerpt}"`;
  if (type === "delete_comment") return `deleted comment "${excerpt}"`;
  return undefined;
}

class CommentActionFailure extends Error {
  constructor(readonly status: number, readonly body: JsonMap) {
    super(String(body.error ?? "Comment action failed"));
  }
}

async function runCommentActions(
  board: { id: string; title: string; blocks: unknown; revision: number },
  email: string,
  comments: JsonMap[],
  role: CommentAccessRole,
  store: WorkspaceCommentStore,
  deferNotifications: boolean,
): Promise<{ status: number; body: JsonMap; notifications: CommentCreatedNotification[] }> {
  const blocks = list(board.blocks);
  const created: Array<{ id: string; blockId: string; body: string }> = [];
  const applied: Array<{ type: string; ids: string[]; changed: boolean; summary?: string }> = [];
  const notifications: CommentCreatedNotification[] = [];
  for (const action of comments) {
    if (action.type !== "add_comment") {
      const result = await applyCommentManagementAction(board.id, email, role, action, store);
      if (!result.ok) return {
        status: result.status,
        body: { error: result.error, reason: "comment_rejected", revision: board.revision, actions: applied },
        notifications,
      };
      created.push(...result.comments);
      const summary = result.changed ? commentSummary(String(action.type), result.comments[0]) : undefined;
      applied.push({ type: String(action.type), ids: result.ids, changed: result.changed, ...(summary ? { summary } : {}) });
      continue;
    }
    const requested = text(field(action, "blockId")) ?? text(field(action, "target"));
    // An exact id wins; a label is accepted only when it names exactly one block.
    const byId = blocks.find((block) => block.id === requested);
    const byLabel = byId ? [] : blocks.filter((block) => requested && textOf(block).trim() === requested);
    const block = requested === "__canvas__" ? { id: "__canvas__" } : byId ?? (byLabel.length === 1 ? byLabel[0] : undefined);
    if (!block) return {
      status: byLabel.length > 1 ? 409 : 422,
      body: {
        error: byLabel.length > 1 ? "Several blocks share that label; give the exact blockId" : "Block not found",
        reason: byLabel.length > 1 ? "ambiguous_target" : "block_not_found",
        revision: board.revision,
        actions: applied,
      },
      notifications,
    };
    const result = await createBoardComment(board, email, {
      blockId: String(block.id),
      body: field(action, "body") ?? field(action, "text") ?? field(action, "comment"),
      parentId: field(action, "parentId") ?? field(action, "replyTo"),
    }, store, { notify: !deferNotifications });
    if (!result.ok) return {
      status: result.status,
      body: { error: result.error, reason: "comment_rejected", revision: board.revision, actions: applied },
      notifications,
    };
    created.push({ id: result.comment.id, blockId: result.comment.blockId, body: result.comment.body });
    if (deferNotifications) notifications.push(result.notification);
    const summary = commentSummary("add_comment", result.comment);
    applied.push({ type: "add_comment", ids: [result.comment.id], changed: true, ...(summary ? { summary } : {}) });
  }
  return {
    status: 200,
    body: { success: true, ok: true, action: "batch", actions: applied, result: { comments: created }, revision: board.revision },
    notifications,
  };
}

/**
 * Handles comment commands outside the board commit: a comment is not board
 * content, so it never bumps the revision or enters the undo history, and a
 * VIEWER may comment and manage their own comments. Returns null when the batch has no comment action so the
 * caller continues with the normal path; a comment mixed with board edits is
 * refused instead of half-applied.
 */
export async function handleCommentActions(
  board: { id: string; title: string; blocks: unknown; revision: number },
  email: string,
  actions: JsonMap[],
  role: CommentAccessRole = "VIEWER",
  receiptKey: CommandReceiptKey | null = null,
): Promise<NextResponse | null> {
  const comments = actions.filter((item) => COMMENT_COMMANDS.has(String(item.type)));
  if (comments.length === 0) return null;
  if (comments.length !== actions.length) {
    return NextResponse.json({
      error: "Comment commands must not be mixed with board edits",
      reason: "mixed_batch",
      revision: board.revision,
    }, { status: 400 });
  }

  try {
    if (receiptKey) {
      const committed = await prisma.$transaction(async (tx) => {
        const result = await runCommentActions(board, email, comments, role, tx, true);
        if (result.status >= 400) throw new CommentActionFailure(result.status, result.body);
        const persisted = Array.isArray(result.body.actions)
          && result.body.actions.some((action) => Boolean(action && typeof action === "object" && (action as JsonMap).changed === true));
        const response = { ...result.body, requestId: receiptKey.requestId, revisionBefore: board.revision, persisted };
        await writeCommandReceipt(tx as Prisma.TransactionClient, receiptKey, response);
        return { ...result, body: response };
      });
      committed.notifications.forEach((notification) => notifyCreatedBoardComment(notification));
      return NextResponse.json(committed.body);
    }
    const result = await runCommentActions(board, email, comments, role, prisma, false);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof CommentActionFailure) return NextResponse.json(error.body, { status: error.status });
    throw error;
  }
}
