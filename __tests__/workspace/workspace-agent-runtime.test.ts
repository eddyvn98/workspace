import { describe, expect, it, vi } from "vitest";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import type { WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";

function runtimeRequest(): WorkspaceRuntimeRequest {
  return {
    boardId: "board-1",
    turnId: "turn-1",
    query: "Update the description",
    modelSelector: "deepseek v4 flash",
    authorization: "Bearer service-key",
    workspaceUserToken: "signed-token",
    canMutate: true,
    signal: new AbortController().signal,
  };
}

describe("Workspace Dify runtime", () => {
  it.each([
    ["Create a version labeled ‘Release check’", "Saved a new version “Release check”."],
    ["Tạo phiên bản có nhãn ‘Kiểm thử phát hành’", "Đã lưu phiên bản “Kiểm thử phát hành”."],
  ])("returns the persisted version receipt in the final answer for %s", async (query, expectedAnswer) => {
    const modelProvider = {
      propose: vi.fn().mockResolvedValue({
        answer: JSON.stringify({ done: true, message: "Workspace changes were saved.", actions: [{ type: "create_version", label: query.includes("Tạo") ? "Kiểm thử phát hành" : "Release check" }] }),
        conversationId: "dify-conversation",
      }),
    };
    const execute = vi.fn(async () => ({
      httpStatus: 200,
      body: {
        success: true,
        revision: 2,
        actions: [{ type: "create_version", ids: ["snapshot-1"], changed: true }],
        result: { snapshot: { id: "snapshot-1", label: query.includes("Tạo") ? "Kiểm thử phát hành" : "Release check" } },
      },
    }));

    const result = await runWorkspaceAgentTurn({ ...runtimeRequest(), query }, {
      modelProvider,
      readSnapshot: vi.fn(async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} })),
      execute,
    });

    expect(result.status).toBe("completed");
    expect(result.answer).toBe(expectedAnswer);
    expect(result.appliedSummaries).toEqual([`create_version: ${expectedAnswer}`]);
    expect(result.focusBlockIds).toEqual([]);
  });

  it("includes slide IDs and names in model-step board context", async () => {
    const modelProvider = {
      propose: vi.fn().mockResolvedValue({ answer: JSON.stringify({ done: true, message: "No change.", actions: [] }), conversationId: null }),
    };
    const readSnapshot = vi.fn(async () => ({
      revision: 1, title: "Board", blockOrder: ["deck-1"], connectors: {},
      blocks: { "deck-1": { type: "slideDeck", data: { title: "Acceptance slides", slideOrder: ["slide-1", "slide-2"], slides: { "slide-1": { name: "Overview" }, "slide-2": { name: "Verification" } } } } },
    }));

    await runWorkspaceAgentTurn(runtimeRequest(), { modelProvider, readSnapshot, execute: vi.fn() });

    const prompt = JSON.parse(modelProvider.propose.mock.calls[0][0].query);
    expect(prompt.board.blocks[0]).toMatchObject({
      id: "deck-1", type: "slideDeck", title: "Acceptance slides", slideCount: 2,
      slides: [{ id: "slide-1", name: "Overview" }, { id: "slide-2", name: "Verification" }],
    });
  });

  it("includes semantic flowchart roots and connectors in model-step context", async () => {
    const modelProvider = { propose: vi.fn().mockResolvedValue({ answer: JSON.stringify({ done: true, message: "No change.", actions: [] }), conversationId: null }) };
    const readSnapshot = vi.fn(async () => ({ revision: 1, title: "Board", blockOrder: ["root", "child"],
      blocks: { root: { type: "text", mapId: "root", mapLayout: { family: "flowchart", direction: "right" }, data: { markdown: "Start request", semanticKey: "step-start" } }, child: { type: "text", mapId: "root", data: { markdown: "Validate command", semanticKey: "step-validate" } } },
      connectors: { link: { fromBlockId: "root", toBlockId: "child", label: "next" } },
    }));
    await runWorkspaceAgentTurn(runtimeRequest(), { modelProvider, readSnapshot, execute: vi.fn() });
    const prompt = JSON.parse(modelProvider.propose.mock.calls[0][0].query);
    expect(prompt.board.blocks[0]).toMatchObject({ id: "root", title: "Start request", mapId: "root", semanticKey: "step-start", mapLayout: { family: "flowchart", direction: "right" } });
    expect(prompt.board.connectors).toEqual([{ id: "link", fromBlockId: "root", toBlockId: "child", label: "next" }]);
  });

  it("exposes durable undo and redo as standalone model actions", async () => {
    const modelProvider = {
      propose: vi.fn().mockResolvedValue({
        answer: JSON.stringify({ done: true, message: "No change.", actions: [] }),
        conversationId: "internal-conversation",
      }),
    };
    const readSnapshot = vi.fn(async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} }));

    await runWorkspaceAgentTurn(runtimeRequest(), { modelProvider, readSnapshot, execute: vi.fn() });

    const prompt = JSON.parse(modelProvider.propose.mock.calls[0][0].query);
    expect(prompt.actionSchemas.undo).toMatchObject({ required: ["type"] });
    expect(prompt.actionSchemas.redo).toMatchObject({ required: ["type"] });
    expect(prompt.instruction).toContain("Follow explicit parameter schemas where present and otherwise follow the selected command guidance");
    expect(prompt.instruction).toContain("when undo or redo is requested, return exactly that single history action");
    expect(prompt.actionSchemas.update_description).toBeDefined();
  });

  it("re-reads between rounds and reports mutations only from executor receipts", async () => {
    const modelProvider = {
      propose: vi.fn()
        .mockResolvedValueOnce({
          answer: JSON.stringify({ done: false, message: "The description is already changed.", actions: [{ type: "update_description", blockId: "block-1", description: "New description" }] }),
          conversationId: "internal-conversation",
        })
        .mockResolvedValueOnce({
          answer: JSON.stringify({ done: true, message: "I also updated two other blocks.", actions: [] }),
          conversationId: "internal-conversation",
        }),
    };
    const readSnapshot = vi.fn(async () => ({ revision: 4, title: "Board", blocks: {}, blockOrder: [], connectors: {} }));
    const execute = vi.fn(async () => ({
      httpStatus: 200,
      body: {
        success: true,
        revision: 5,
        actions: [{ type: "update_description", ids: ["block-1"], changed: true }],
        result: { changedBlocks: [{ id: "block-1", summary: "Persisted description text" }] },
      },
    }));

    const result = await runWorkspaceAgentTurn(runtimeRequest(), { modelProvider, readSnapshot, execute });

    expect(result.status).toBe("completed");
    expect(result.rounds).toBe(2);
    expect(readSnapshot).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledWith(expect.anything(), "turn-1", 1, 4, [expect.objectContaining({ type: "update_description" })]);
    expect(result.receipts[0]).toMatchObject({ requestId: "turn-1:1", persisted: true, revisionBefore: 4, revisionAfter: 5 });
    expect(result.appliedSummaries).toEqual(["update_description: Persisted description text"]);
    expect(result.answer).toBe("Workspace changes were saved: update_description: Persisted description text.");
    expect(result.answer).not.toContain("two other blocks");
    const secondPrompt = JSON.parse(modelProvider.propose.mock.calls[1][0].query);
    expect(secondPrompt.confirmedReceipts).toHaveLength(1);
  });

  it("runs a supported tree command only after resolving its exact board target", async () => {
    const modelProvider = {
      propose: vi.fn().mockResolvedValue({
        answer: JSON.stringify({ done: true, message: "Deleted.", actions: [{ type: "delete_node", blockId: "block-1" }] }),
        conversationId: null,
      }),
    };
    const execute = vi.fn(async () => ({
      httpStatus: 200,
      body: {
        success: true,
        revision: 2,
        actions: [{ type: "delete_node", ids: ["block-1"], changed: true }],
        result: { changedBlocks: [] },
      },
    }));

    const result = await runWorkspaceAgentTurn(runtimeRequest(), {
      modelProvider,
      readSnapshot: vi.fn(async () => ({
        revision: 1,
        title: "Board",
        blocks: { root: { id: "root", type: "text" }, "block-1": { id: "block-1", type: "text", parentId: "root", data: { markdown: "Disposable test node" } } },
        blockOrder: ["root", "block-1"],
        connectors: {},
      })),
      execute,
    });

    expect(result.status).toBe("completed");
    expect(execute).toHaveBeenCalledWith(expect.anything(), "turn-1", 1, 1, [expect.objectContaining({ type: "delete_node", blockId: "block-1" })]);
    expect(result.receipts[0]).toMatchObject({ actionType: "delete_node", persisted: true, revisionBefore: 1, revisionAfter: 2 });
    expect(result.appliedSummaries).toEqual(["delete_node: deleted Disposable test node"]);
    expect(result.answer).toBe("Workspace changes were saved: delete_node: deleted Disposable test node.");
  });

  it("rejects commands outside the pilot before the shared executor is called", async () => {
    const modelProvider = {
      propose: vi.fn().mockResolvedValue({
        answer: JSON.stringify({ done: true, message: "Done.", actions: [{ type: "unsupported_command", blockId: "block-1" }] }),
        conversationId: null,
      }),
    };
    const execute = vi.fn();
    const result = await runWorkspaceAgentTurn(runtimeRequest(), {
      modelProvider,
      readSnapshot: vi.fn(async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} })),
      execute,
    });
    expect(result.status).toBe("failed");
    expect(execute).not.toHaveBeenCalled();
  });

  it("executes a final proposal once and builds the answer from its receipt", async () => {
    const modelProvider = {
      propose: vi.fn().mockResolvedValue({
        answer: JSON.stringify({ done: true, message: "Done.", actions: [{ type: "rename_topic", blockId: "block-1", title: "New title" }] }),
        conversationId: null,
      }),
    };
    const execute = vi.fn(async () => ({
      httpStatus: 200,
      body: {
        success: true,
        revision: 2,
        actions: [{ type: "rename_topic", ids: ["block-1"], changed: true }],
        result: { changedBlocks: [{ id: "block-1", summary: "New title" }] },
      },
    }));

    const result = await runWorkspaceAgentTurn(runtimeRequest(), {
      modelProvider,
      readSnapshot: vi.fn(async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} })),
      execute,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("completed");
    expect(result.answer).toContain("rename_topic: New title");
    expect(result.appliedSummaries).toEqual(["rename_topic: New title"]);
  });

  it("does not execute a proposal after the durable turn is cancelled", async () => {
    const modelProvider = {
      propose: vi.fn().mockResolvedValue({
        answer: JSON.stringify({ done: true, message: "Done.", actions: [{ type: "rename_topic", blockId: "block-1", title: "New title" }] }),
        conversationId: null,
      }),
    };
    const isCancelled = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const execute = vi.fn();

    const result = await runWorkspaceAgentTurn(runtimeRequest(), {
      modelProvider,
      readSnapshot: vi.fn(async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} })),
      execute,
      isCancelled,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.status).toBe("partial");
    expect(result.unresolvedSummaries[0]).toContain("cancelled");
  });

  it("keeps a committed receipt but returns partial when cancellation races the executor", async () => {
    const modelProvider = {
      propose: vi.fn().mockResolvedValue({
        answer: JSON.stringify({ done: true, message: "Done.", actions: [{ type: "rename_topic", blockId: "block-1", title: "New title" }] }),
        conversationId: null,
      }),
    };
    let cancelled = false;
    const isCancelled = vi.fn(async () => cancelled);
    const execute = vi.fn(async () => {
      cancelled = true;
      return {
      httpStatus: 200,
      body: {
        success: true,
        revision: 2,
        actions: [{ type: "rename_topic", ids: ["block-1"], changed: true }],
        result: { changedBlocks: [{ id: "block-1", summary: "New title" }] },
      },
      };
    });

    const result = await runWorkspaceAgentTurn(runtimeRequest(), {
      modelProvider,
      readSnapshot: vi.fn(async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} })),
      execute,
      isCancelled,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("partial");
    expect(result.receipts).toMatchObject([{ persisted: true, revisionAfter: 2 }]);
    expect(result.unresolvedSummaries[0]).toContain("cancelled");
  });
});
