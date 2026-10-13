import { describe, expect, it, vi } from "vitest";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import type { WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";

function runtimeInput(query: string, canMutate = false): WorkspaceRuntimeRequest {
  return {
    boardId: "board-1",
    turnId: "turn-1",
    query,
    modelSelector: "model",
    authorization: "Bearer token",
    workspaceUserToken: "user-token",
    canMutate,
    signal: new AbortController().signal,
  };
}

describe("Workspace runtime read-only response claims", () => {
  it("does not treat mutation words inside read-only comment content as a mutation claim", async () => {
    const result = await runWorkspaceAgentTurn(runtimeInput("Liệt kê comments"), {
      readSnapshot: async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} }),
      modelProvider: { propose: async ({ round }) => round === 1
        ? { answer: JSON.stringify({ done: true, message: "Đang đọc comments.", actions: [{ type: "list_comments" }] }), conversationId: "dify-1" }
        : { answer: JSON.stringify({ done: true, message: "Comment: Runtime acceptance comment updated; trạng thái chưa giải quyết.", actions: [] }), conversationId: "dify-1" } },
      execute: async () => ({ httpStatus: 200, body: {
        success: true,
        revision: 1,
        actions: [{ type: "list_comments", ids: ["comment-1"], changed: false }],
        result: { comments: [{ id: "comment-1", body: "Runtime acceptance comment updated", resolved: false }] },
      } }),
    });

    expect(result.status).toBe("completed");
    expect(result.answer).toContain("Runtime acceptance comment updated");
    expect(result.unresolvedSummaries).toEqual([]);
    expect(result.receipts[0]).toMatchObject({ actionType: "list_comments", persisted: false });
  });

  it("still flags a requested mutation claim without a persisted action receipt", async () => {
    const result = await runWorkspaceAgentTurn(runtimeInput("Update the map layout to left", true), {
      readSnapshot: async () => ({ revision: 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} }),
      modelProvider: { propose: async () => ({ answer: JSON.stringify({ done: true, message: "I updated the map layout.", actions: [] }), conversationId: "dify-1" }) },
      execute: async () => ({ httpStatus: 200, body: { success: true, revision: 1, actions: [], result: {} } }),
    });

    expect(result.status).toBe("partial");
    expect(result.unresolvedSummaries).toContain("The model reported a change without a persisted action receipt.");
  });

  it("does not execute a mutation proposed for a viewer", async () => {
    const execute = vi.fn();
    const result = await runWorkspaceAgentTurn(runtimeInput("Update this block", false), {
      readSnapshot: async () => ({
        revision: 3,
        title: "Board",
        blocks: { block: { id: "block", type: "text", title: "Before", data: { title: "Before" } } },
        blockOrder: ["block"],
        connectors: {},
      }),
      modelProvider: { propose: async () => ({
        answer: JSON.stringify({ done: true, message: "Updated.", actions: [{
          type: "update_description", blockId: "block", description: "After",
        }] }),
        conversationId: "dify-1",
      }) },
      execute,
    });

    expect(result.status).toBe("partial");
    expect(result.appliedSummaries).toEqual([]);
    expect(result.unresolvedSummaries).toContain("This user can view the board but does not have permission to change it.");
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not execute a repeated add_comment proposal in a later model round", async () => {
    let executions = 0;
    const action = { type: "add_comment", blockId: "block-1", parentId: "comment-1", body: "Reply check" };
    const result = await runWorkspaceAgentTurn(runtimeInput("Reply to the test comment", true), {
      readSnapshot: async () => ({ revision: executions + 1, title: "Board", blocks: {}, blockOrder: [], connectors: {} }),
      modelProvider: { propose: async () => ({
        answer: JSON.stringify({ done: false, message: "Replying.", actions: [action] }), conversationId: "dify-1",
      }) },
      execute: async () => {
        executions += 1;
        return { httpStatus: 200, body: { success: true, revision: 2, actions: [{ type: "add_comment", ids: ["comment-2"], changed: true }], result: {} } };
      },
    });

    expect(executions).toBe(1);
    expect(result.status).toBe("completed");
    expect(result.receipts.filter((receipt) => receipt.actionType === "add_comment" && receipt.persisted)).toHaveLength(1);
  });

  it.each([
    {
      action: { type: "connect_nodes", from: "Runtime Shape Probe", to: "Receipt reload test", label: "P4 connector smoke" },
      query: "Connect Runtime Shape Probe to Receipt reload test",
      expected: ['"Runtime Shape Probe" to "Receipt reload test"', '("P4 connector smoke")'],
    },
    {
      action: { type: "disconnect_nodes", connectorId: "connector-1" },
      query: "Disconnect the P4 connector smoke connector",
      expected: ['"Runtime Shape Probe" from "Receipt reload test"', '("P4 connector smoke")'],
    },
  ])("returns a named persisted receipt for $action.type", async ({ action, query, expected }) => {
    const connectorId = "connector-1";
    const result = await runWorkspaceAgentTurn(runtimeInput(query, true), {
      readSnapshot: async () => ({
        revision: 4,
        title: "Board",
        blocks: {
          "source-block": { id: "source-block", type: "shape", title: "Runtime Shape Probe", data: { title: "Runtime Shape Probe" } },
          "target-block": { id: "target-block", type: "text", title: "Receipt reload test", data: { title: "Receipt reload test" } },
        },
        blockOrder: ["source-block", "target-block"],
        connectors: {
          [connectorId]: { id: connectorId, fromBlockId: "source-block", toBlockId: "target-block", label: "P4 connector smoke" },
        },
      }),
      modelProvider: { propose: async () => ({
        answer: JSON.stringify({ done: true, message: "Done.", actions: [action] }),
        conversationId: "dify-conversation",
      }) },
      execute: async () => ({ httpStatus: 200, body: {
        success: true,
        revision: 5,
        actions: [{ type: action.type, changed: true, ids: [connectorId] }],
        result: {},
      } }),
    });

    expect(result.status).toBe("completed");
    expected.forEach((part) => expect(result.answer).toContain(part));
    expect(result.receipts[0]).toMatchObject({ persisted: true, targetIds: [connectorId], revisionBefore: 4, revisionAfter: 5 });
  });

  it("names the changed slide in the persisted update receipt", async () => {
    const result = await runWorkspaceAgentTurn(runtimeInput("Thêm bullet vào slide Content edit smoke", true), {
      readSnapshot: async () => ({
        revision: 4,
        title: "Board",
        blocks: {
          "deck-1": {
            id: "deck-1",
            type: "slideDeck",
            title: "Acceptance slides",
            data: {
              slideOrder: ["slide-1"],
              slides: { "slide-1": { id: "slide-1", name: "Content edit smoke 2026-10-07", html: "<ul><li>Initial</li></ul>" } },
            },
          },
        },
        blockOrder: ["deck-1"],
        connectors: {},
      }),
      modelProvider: { propose: async () => ({
        answer: JSON.stringify({ done: true, message: "Updated.", actions: [{
          type: "update_slide", blockId: "deck-1", slideId: "slide-1", html: "<ul><li>Initial</li><li>Edited</li></ul>",
        }] }),
        conversationId: "dify-conversation",
      }) },
      execute: async () => ({ httpStatus: 200, body: {
        success: true,
        revision: 5,
        actions: [{ type: "update_slide", changed: true, ids: ["deck-1"], summary: "Acceptance slides" }],
        result: { changedBlocks: [{ id: "deck-1", summary: "Acceptance slides" }] },
      } }),
    });

    expect(result.status).toBe("completed");
    expect(result.answer).toContain('updated slide "Content edit smoke 2026-10-07" in deck "Acceptance slides"');
  });
});
