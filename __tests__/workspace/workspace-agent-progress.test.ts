import { afterEach, describe, expect, it, vi } from "vitest";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import type { WorkspaceRuntimeRequest, WorkspaceTurnProgressInput } from "@/lib/workspace-agent/contracts";

function runtimeRequest(): WorkspaceRuntimeRequest {
  return {
    boardId: "board-1",
    turnId: "turn-progress-1",
    query: "Rename the topic",
    modelSelector: "deepseek-v4-flash",
    authorization: "Bearer service-key",
    workspaceUserToken: "signed-token",
    canMutate: true,
    signal: new AbortController().signal,
  };
}

function snapshot(revision: number) {
  return { revision, title: "Board", blocks: {}, blockOrder: [], connectors: {} };
}

afterEach(() => vi.restoreAllMocks());

describe("Workspace runtime progress", () => {
  it("reports phases in order and persists progress only from confirmed receipts", async () => {
    const events: WorkspaceTurnProgressInput[] = [];
    const modelProvider = {
      propose: vi.fn()
        .mockResolvedValueOnce({
          answer: JSON.stringify({ done: false, message: "Working", actions: [{ type: "rename_topic", blockId: "block-1", title: "Updated" }] }),
          conversationId: "internal-conversation",
        })
        .mockResolvedValueOnce({ answer: JSON.stringify({ done: true, message: "Done", actions: [] }), conversationId: "internal-conversation" }),
    };
    const execute = vi.fn(async () => ({
      httpStatus: 200,
      body: {
        success: true,
        revision: 2,
        actions: [{ type: "rename_topic", ids: ["block-1"], changed: true }],
        result: { changedBlocks: [{ id: "block-1", summary: "Updated" }] },
      },
    }));

    const result = await runWorkspaceAgentTurn(runtimeRequest(), {
      modelProvider,
      readSnapshot: vi.fn().mockResolvedValueOnce(snapshot(1)).mockResolvedValueOnce(snapshot(2)),
      execute,
      onProgress: async (event) => { events.push(event); },
    });

    expect(result.status).toBe("completed");
    expect(events.map(({ phase }) => phase)).toEqual(["model_step", "executing", "persisted", "model_step"]);
    expect(events[2]).toMatchObject({ phase: "persisted", round: 1, persistedCount: 1, revision: 2 });
  });

  it("keeps committed execution successful when progress storage fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const execute = vi.fn(async () => ({
      httpStatus: 200,
      body: {
        success: true,
        revision: 2,
        actions: [{ type: "rename_topic", ids: ["block-1"], changed: true }],
        result: { changedBlocks: [{ id: "block-1", summary: "Updated" }] },
      },
    }));
    const result = await runWorkspaceAgentTurn(runtimeRequest(), {
      modelProvider: {
        propose: vi.fn().mockResolvedValue({
          answer: JSON.stringify({ done: true, message: "Done", actions: [{ type: "rename_topic", blockId: "block-1", title: "Updated" }] }),
          conversationId: null,
        }),
      },
      readSnapshot: vi.fn().mockResolvedValue(snapshot(1)),
      execute,
      onProgress: async () => { throw new Error("storage unavailable"); },
    });

    expect(result.status).toBe("completed");
    expect(result.receipts).toMatchObject([{ persisted: true, revisionAfter: 2 }]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith("[workspace-agent-progress]", expect.objectContaining({ errorCode: "progress_store_failed" }));
  });

  it("checks durable cancellation after an awaited executing event", async () => {
    let cancelled = false;
    const execute = vi.fn();
    const result = await runWorkspaceAgentTurn(runtimeRequest(), {
      modelProvider: {
        propose: vi.fn().mockResolvedValue({
          answer: JSON.stringify({ done: true, message: "Done", actions: [{ type: "rename_topic", blockId: "block-1", title: "Updated" }] }),
          conversationId: null,
        }),
      },
      readSnapshot: vi.fn().mockResolvedValue(snapshot(1)),
      execute,
      isCancelled: async () => cancelled,
      onProgress: async (event) => {
        if (event.phase === "executing") {
          await Promise.resolve();
          cancelled = true;
        }
      },
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.status).toBe("partial");
    expect(result.unresolvedSummaries[0]).toContain("cancelled");
  });
});
