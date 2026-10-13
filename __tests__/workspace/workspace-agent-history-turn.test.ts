import { describe, expect, it } from "vitest";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";

const input = (query: string) => ({
  boardId: "history-board", turnId: "history-turn", query, modelSelector: "model",
  authorization: "Bearer token", workspaceUserToken: "user-token", canMutate: true,
  signal: new AbortController().signal,
});
const snapshot = () => ({ revision: 56, title: "Board", blocks: {}, blockOrder: [], connectors: {} });

describe("one durable history transition per runtime turn", () => {
  it.each(["undo", "redo"])("finishes %s after persistence even when the model says done=false", async (type) => {
    let modelCalls = 0, executorCalls = 0;
    const result = await runWorkspaceAgentTurn(input(`${type} the last AI change`), {
      readSnapshot: async () => snapshot(),
      modelProvider: { propose: async () => {
        modelCalls += 1;
        if (modelCalls > 1) throw new Error("A second history model step could repeat the already committed action");
        return { answer: JSON.stringify({ done: false, message: "Applying history.", actions: [{ type }] }), conversationId: "dify-history" };
      } },
      execute: async () => {
        executorCalls += 1;
        return { httpStatus: 200, body: { success: true, revision: 57, actions: [{ type, ids: [type], changed: true }] } };
      },
    });
    expect(result.status).toBe("completed");
    expect(result.rounds).toBe(1);
    expect(result.receipts).toMatchObject([{ actionType: type, persisted: true, revisionBefore: 56, revisionAfter: 57 }]);
    expect(result.unresolvedSummaries).toEqual([]);
    expect(modelCalls).toBe(1);
    expect(executorCalls).toBe(1);
  });

  it("keeps a conflict truthful without repeating or claiming a persisted transition", async () => {
    let modelCalls = 0;
    const result = await runWorkspaceAgentTurn(input("Undo"), {
      readSnapshot: async () => snapshot(),
      modelProvider: { propose: async () => {
        modelCalls += 1;
        return { answer: JSON.stringify({ done: false, message: "Undoing.", actions: [{ type: "undo" }] }), conversationId: null };
      } },
      execute: async () => ({ httpStatus: 409, body: { success: false, reason: "history_conflict", error: "The recorded change no longer applies.", actions: [{ type: "undo", ids: ["undo"], changed: false }] } }),
    });
    expect(result.status).toBe("partial");
    expect(result.receipts[0].persisted).toBe(false);
    expect(result.unresolvedSummaries.join(" ")).toContain("The recorded change no longer applies");
    expect(modelCalls).toBe(1);
  });

  it("retains further model steps for ordinary edits with done=false", async () => {
    let modelCalls = 0;
    const result = await runWorkspaceAgentTurn(input("Rename the board"), {
      readSnapshot: async () => snapshot(),
      modelProvider: { propose: async () => {
        modelCalls += 1;
        return { answer: JSON.stringify(modelCalls === 1
          ? { done: false, message: "Renaming.", actions: [{ type: "rename_board", title: "New board" }] }
          : { done: true, message: "Finished.", actions: [] }), conversationId: null };
      } },
      execute: async () => ({ httpStatus: 200, body: { success: true, revision: 57, actions: [{ type: "rename_board", ids: ["board"], changed: true }] } }),
    });
    expect(result.status).toBe("completed");
    expect(modelCalls).toBe(2);
  });
});
