import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBoardComment: vi.fn(),
  notifyCreatedBoardComment: vi.fn(),
  writeCommandReceipt: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/workspace/commandReceipts", () => ({ writeCommandReceipt: mocks.writeCommandReceipt }));
vi.mock("@/lib/workspace/comment-repository", () => ({
  createBoardComment: mocks.createBoardComment,
  notifyCreatedBoardComment: mocks.notifyCreatedBoardComment,
}));

import { handleCommentActions } from "@/app/api/workspaces/[id]/agent/commentAction";

const board = {
  id: "b1",
  title: "Board",
  revision: 7,
  blocks: [
    { id: "a", type: "text", data: { markdown: "Alpha" } },
    { id: "d1", type: "text", data: { markdown: "Dup" } },
    { id: "d2", type: "text", data: { markdown: "Dup" } },
  ],
};

describe("add_comment agent command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createBoardComment.mockResolvedValue({
      ok: true,
      comment: { id: "c1", blockId: "a", body: "check this" },
      notification: { boardId: "b1", boardTitle: "Board", email: "u@x.com", blockId: "a", commentId: "c1", parentAuthor: null },
    });
    mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({}));
  });

  it("ignores batches without a comment so the normal path runs", async () => {
    expect(await handleCommentActions(board, "u@x.com", [{ type: "update_style" }])).toBeNull();
  });

  it("comments on a block by id without touching the revision", async () => {
    const res = await handleCommentActions(board, "u@x.com", [{ type: "add_comment", blockId: "a", body: "check this" }]);
    const json = await res!.json();
    expect(res!.status).toBe(200);
    expect(json).toMatchObject({ success: true, revision: 7, result: { comments: [{ id: "c1", blockId: "a" }] } });
    expect(json.actions).toEqual([expect.objectContaining({
      type: "add_comment",
      ids: ["c1"],
      changed: true,
      summary: 'added comment "check this"',
    })]);
    expect(mocks.createBoardComment).toHaveBeenCalledWith(board, "u@x.com", expect.objectContaining({ blockId: "a", body: "check this" }), expect.anything(), { notify: true });
  });

  it("supports the same general canvas comment as the manual composer", async () => {
    const response = await handleCommentActions(board, "u@x.com", [{ type: "add_comment", blockId: "__canvas__", body: "General review" }]);
    expect(response!.status).toBe(200);
    expect(mocks.createBoardComment).toHaveBeenLastCalledWith(board, "u@x.com", expect.objectContaining({ blockId: "__canvas__" }), expect.anything(), { notify: true });
  });

  it("accepts a unique label and refuses an ambiguous one", async () => {
    const ok = await handleCommentActions(board, "u@x.com", [{ type: "add_comment", blockId: "Alpha", body: "hi" }]);
    expect(ok!.status).toBe(200);
    expect(mocks.createBoardComment).toHaveBeenLastCalledWith(board, "u@x.com", expect.objectContaining({ blockId: "a" }), expect.anything(), { notify: true });
    const dup = await handleCommentActions(board, "u@x.com", [{ type: "add_comment", blockId: "Dup", body: "hi" }]);
    expect(dup!.status).toBe(409);
  });

  it("rejects a missing block and a mixed batch", async () => {
    expect((await handleCommentActions(board, "u@x.com", [{ type: "add_comment", blockId: "zzz", body: "x" }]))!.status).toBe(422);
    expect((await handleCommentActions(board, "u@x.com", [{ type: "add_comment", blockId: "a", body: "x" }, { type: "update_style" }]))!.status).toBe(400);
  });

  it("commits comment changes and their replay receipt in one transaction", async () => {
    const tx = {};
    mocks.transaction.mockImplementation(async (work: (transaction: unknown) => Promise<unknown>) => work(tx));
    const receiptKey = { boardId: "b1", actorEmail: "u@x.com", requestId: "turn-1:1", payloadHash: "hash" };

    const response = await handleCommentActions(board, "u@x.com", [{ type: "add_comment", blockId: "a", body: "check this" }], "EDITOR", receiptKey);

    expect(response!.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.createBoardComment).toHaveBeenCalledWith(board, "u@x.com", expect.anything(), tx, { notify: false });
    expect(mocks.writeCommandReceipt).toHaveBeenCalledWith(tx, receiptKey, expect.objectContaining({
      requestId: "turn-1:1",
      revisionBefore: 7,
      persisted: true,
      actions: [expect.objectContaining({ summary: 'added comment "check this"' })],
    }));
    expect(mocks.notifyCreatedBoardComment).toHaveBeenCalledWith(expect.objectContaining({ commentId: "c1" }));
  });

  it("rolls back a comment batch when a later target is invalid", async () => {
    const receiptKey = { boardId: "b1", actorEmail: "u@x.com", requestId: "turn-2:1", payloadHash: "hash" };

    const response = await handleCommentActions(board, "u@x.com", [
      { type: "add_comment", blockId: "a", body: "valid first action" },
      { type: "add_comment", blockId: "missing", body: "invalid second action" },
    ], "EDITOR", receiptKey);

    expect(response!.status).toBe(422);
    expect(mocks.createBoardComment).toHaveBeenCalledOnce();
    expect(mocks.writeCommandReceipt).not.toHaveBeenCalled();
    expect(mocks.notifyCreatedBoardComment).not.toHaveBeenCalled();
  });
});
