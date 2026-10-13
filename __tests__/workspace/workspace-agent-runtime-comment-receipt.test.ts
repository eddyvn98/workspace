import { describe, expect, it, vi } from "vitest";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import type { WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";

const request: WorkspaceRuntimeRequest = {
  boardId: "board-1",
  turnId: "comment-turn-1",
  query: "Add a comment to Review",
  modelSelector: "gpt-5.6-luna",
  authorization: "Bearer service-key",
  workspaceUserToken: "signed-user-token",
  canMutate: true,
  signal: new AbortController().signal,
};

describe("Workspace runtime comment receipts", () => {
  it("turns a persisted comment action summary into the final user receipt", async () => {
    const modelProvider = {
      propose: vi.fn().mockResolvedValue({
        answer: JSON.stringify({
          done: true,
          message: "Comment added.",
          actions: [{ type: "add_comment", blockId: "block-1", body: "receipt smoke" }],
        }),
        conversationId: null,
      }),
    };
    const readSnapshot = vi.fn(async () => ({
      revision: 7,
      title: "Board",
      blocks: { "block-1": { id: "block-1", type: "text", data: { markdown: "Review" } } },
      blockOrder: ["block-1"],
      connectors: {},
    }));
    const execute = vi.fn(async () => ({
      httpStatus: 200,
      body: {
        success: true,
        revision: 7,
        actions: [{ type: "add_comment", ids: ["comment-1"], changed: true, summary: 'added comment "receipt smoke"' }],
        result: { comments: [{ id: "comment-1", blockId: "block-1", body: "receipt smoke" }] },
      },
    }));

    const result = await runWorkspaceAgentTurn(request, { modelProvider, readSnapshot, execute });

    expect(result.receipts).toEqual([expect.objectContaining({
      actionType: "add_comment",
      targetIds: ["comment-1"],
      persisted: true,
      revisionBefore: 7,
      revisionAfter: 7,
      summary: 'add_comment: added comment "receipt smoke"',
    })]);
    expect(result.appliedSummaries).toEqual(['add_comment: added comment "receipt smoke"']);
    expect(result.answer).toContain('add_comment: added comment "receipt smoke"');
  });
});
