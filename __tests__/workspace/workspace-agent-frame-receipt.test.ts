import { describe, expect, it, vi } from "vitest";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import type { WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";

const request: WorkspaceRuntimeRequest = {
  boardId: "board-1",
  turnId: "frame-delete-1",
  query: "Delete the saved frame named Acceptance frame",
  modelSelector: "openai/gpt-5.6-luna",
  authorization: "Bearer test",
  workspaceUserToken: "signed-test-token",
  canMutate: true,
  signal: new AbortController().signal,
};

describe("Workspace frame mutation receipts", () => {
  it("includes the executor's frame name in the Dify-facing result and persisted summary", async () => {
    const modelProvider = {
      propose: vi.fn().mockResolvedValue({
        answer: JSON.stringify({ done: true, message: "Deleted.", actions: [{ type: "delete_frame", frameName: "Acceptance frame" }] }),
        conversationId: "user-conversation",
      }),
    };
    const result = await runWorkspaceAgentTurn(request, {
      modelProvider,
      readSnapshot: vi.fn(async () => ({
        revision: 7,
        title: "Board",
        blocks: {},
        blockOrder: [],
        connectors: {},
        frames: [{ id: "frame-1", name: "Acceptance frame", order: 0 }],
      })),
      execute: vi.fn(async () => ({
        httpStatus: 200,
        body: {
          success: true,
          revision: 8,
          actions: [{ type: "delete_frame", ids: ["frame-1"], changed: true, summary: 'deleted frame "Acceptance frame"' }],
          result: { changedFrames: [], removedFrameIds: ["frame-1"] },
        },
      })),
    });

    expect(result.status).toBe("completed");
    expect(result.receipts).toMatchObject([{ actionType: "delete_frame", targetIds: ["frame-1"], persisted: true, revisionBefore: 7, revisionAfter: 8 }]);
    expect(result.appliedSummaries).toEqual(['delete_frame: deleted frame "Acceptance frame"']);
    expect(result.answer).toBe('Workspace changes were saved: delete_frame: deleted frame "Acceptance frame".');
  });
});
