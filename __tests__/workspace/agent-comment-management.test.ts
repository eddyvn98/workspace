import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceBoardComment: db } }));
vi.mock("@/lib/workspace/comment-repository", () => ({ createBoardComment: vi.fn() }));

import { manageBoardComment } from "@/lib/workspace/comment-management";
import { handleCommentActions } from "@/app/api/workspaces/[id]/agent/commentAction";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";
import { computeAssistantTurnResult } from "@/app/workspace/hooks/workspaceChatTurnResult";
import { countCommentChanges } from "@/app/workspace/utils/workspaceCommentCount";
import type { WorkspaceComment } from "@/app/workspace/hooks/workspaceCommentApi";

const comment: WorkspaceComment = { id: "c1", boardId: "b1", blockId: "block", authorEmail: "author@x.com", body: "Review", resolved: false, parentId: null, createdAt: "now", updatedAt: "now" };
const board = { id: "b1", title: "Test", revision: 7, blocks: [] };

describe("AI and REST comment management share permissions and persisted results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.findUnique.mockResolvedValue(comment);
    db.findMany.mockResolvedValue([comment]);
    db.update.mockImplementation(async ({ data }) => ({ ...comment, ...data }));
  });
  it("lists exact IDs without touching board revision, then edits an author's comment", async () => {
    const response = await handleCommentActions(board, "AUTHOR@x.com", [{ type: "list_comments" }, { type: "edit_comment", commentId: "c1", body: "Checked" }], "VIEWER");
    expect(await response!.json()).toMatchObject({ revision: 7, actions: [
      { type: "list_comments", ids: ["c1"], changed: false },
      { type: "edit_comment", ids: ["c1"], changed: true, summary: 'edited comment to "Checked"' },
    ] });
    expect(db.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { body: "Checked" } });
  });
  it("summarizes comment moderation and deletion receipts", async () => {
    const resolve = await handleCommentActions(board, "author@x.com", [{ type: "resolve_comment", commentId: "c1" }], "VIEWER");
    expect((await resolve!.json()).actions).toEqual([expect.objectContaining({ changed: true, summary: 'resolved comment "Review"' })]);

    db.findUnique.mockResolvedValueOnce({ ...comment, resolved: true });
    const reopen = await handleCommentActions(board, "author@x.com", [{ type: "reopen_comment", commentId: "c1" }], "VIEWER");
    expect((await reopen!.json()).actions).toEqual([expect.objectContaining({ changed: true, summary: 'reopened comment "Review"' })]);

    const remove = await handleCommentActions(board, "author@x.com", [{ type: "delete_comment", commentId: "c1" }], "VIEWER");
    expect((await remove!.json()).actions).toEqual([expect.objectContaining({ changed: true, summary: 'deleted comment "Review"' })]);
  });
  it("rejects edits by other users even when they own the board", async () => {
    expect(await manageBoardComment("b1", "c1", "owner@x.com", "OWNER", { body: "Changed" })).toMatchObject({ ok: false, status: 403 });
    expect(db.update).not.toHaveBeenCalled();
  });
  it("allows editor moderation and an author's own viewer moderation", async () => {
    expect(await manageBoardComment("b1", "c1", "editor@x.com", "EDITOR", { resolved: true })).toMatchObject({ ok: true, changed: true, comment: { resolved: true } });
    expect(await manageBoardComment("b1", "c1", "author@x.com", "VIEWER", { delete: true })).toMatchObject({ ok: true, changed: true });
    expect(db.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(await manageBoardComment("b1", "c1", "other@x.com", "VIEWER", { resolved: true })).toMatchObject({ ok: false, status: 403 });
  });
  it("rejects cross-board IDs, empty/oversized bodies and invented IDs", async () => {
    expect(await manageBoardComment("other-board", "c1", "author@x.com", "OWNER", { delete: true })).toMatchObject({ status: 404 });
    expect(await manageBoardComment("b1", "c1", "author@x.com", "OWNER", { body: " " })).toMatchObject({ status: 400 });
    expect(await manageBoardComment("b1", "c1", "author@x.com", "OWNER", { body: "x".repeat(10001) })).toMatchObject({ status: 413 });
    expect((await handleCommentActions(board, "author@x.com", [{ type: "edit_comment", body: "x" }], "OWNER"))!.status).toBe(400);
  });
  it("reports an unchanged resolve accurately and rejects mixed board edits", async () => {
    expect(await manageBoardComment("b1", "c1", "author@x.com", "VIEWER", { resolved: false })).toMatchObject({ ok: true, changed: false });
    expect(db.update).not.toHaveBeenCalled();
    expect((await handleCommentActions(board, "author@x.com", [{ type: "resolve_comment", commentId: "c1" }, { type: "update_style" }], "OWNER"))!.status).toBe(400);
  });
  it("verifies edit, resolve and deletion through snapshots even when count does not increase", () => {
    expect(countCommentChanges([comment], [{ ...comment, body: "Checked" }])).toBe(1);
    expect(countCommentChanges([comment], [{ ...comment, resolved: true }])).toBe(1);
    expect(countCommentChanges([comment], [])).toBe(1);
    expect(countCommentChanges([comment], [comment])).toBe(0);
    expect(countCommentChanges([comment], null)).toBe(0);
    const remote = { id: "b1", revision: 7, title: "Test", blocks: {}, blockOrder: [], connectors: {} } as never;
    const turn = computeAssistantTurnResult({ boardBefore: remote, boardAfter: remote, localBlocksBefore: {}, localBlocksAfter: {}, localConnectorsBefore: {}, localConnectorsAfter: {}, parsedDifyAnswer: { content: "Updated the comment.", appliedSummaries: ["Updated comment"] }, userRequest: "Edit the comment", actionResult: null, invalidActionResponse: false, commentsChanged: 1 });
    expect(turn.claimedMutationWithoutPersistence).toBe(false);
    expect(turn.content).toBe("Updated the comment.");
  });
});

describe("comment action proposal schemas", () => {
  const proposal = (action: Record<string, unknown>) => JSON.stringify({
    done: false, message: "Applying the requested change.", actions: [action],
  });

  it.each([
    { type: "add_comment", target: "__canvas__", text: "Canvas note" },
    { type: "add_comment", blockId: "b1", body: "Reply", replyTo: "c1" },
    { type: "list_comments", blockId: "b1" },
    { type: "edit_comment", commentId: "c1", body: "Updated" },
    { type: "resolve_comment", commentId: "c1" },
    { type: "reopen_comment", commentId: "c1" },
    { type: "delete_comment", commentId: "c1" },
  ])("accepts valid $type proposal", (action) => {
    expect(parseWorkspaceModelProposal(proposal(action)).actions).toEqual([action]);
  });

  it.each([
    [{ type: "add_comment", target: "b1" }, /non-empty body/],
    [{ type: "edit_comment", commentId: "c1" }, /body/],
    [{ type: "delete_comment", commentId: "c1", extra: true }, /unsupported fields/],
  ])("rejects invalid comment action proposal", (action, issue) => {
    expect(() => parseWorkspaceModelProposal(proposal(action))).toThrow(issue);
  });
});
