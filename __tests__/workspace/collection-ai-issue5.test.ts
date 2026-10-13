import { describe, expect, it, vi } from "vitest";
import { createCollection } from "@/app/workspace/collections/model";
import { applyCollectionAction } from "@/app/api/workspaces/[id]/agent/collectionOperations";
import { resolveCollectionTargets } from "@/lib/workspace-agent/collectionTargetResolution";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import { parseDifyAgentAnswer } from "@/app/workspace/utils/workspaceDifyAgentResponse";
import { consumeWorkspaceChatResponse } from "@/app/workspace/utils/workspaceChatStream";
import type { WorkspaceJson, WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";

function fixture() {
  const data = createCollection();
  const state = { blocks: { c1: { id: "c1", type: "collection", data } }, blockOrder: ["c1"], connectors: {}, title: "Board" };
  return { data, state };
}
const asBoard = (state: unknown) => state as WorkspaceJson;
describe("Collection AI issue #5 regressions", () => {
  it("resolves a unique field and view name to persisted IDs before removal", () => {
    const { data, state } = fixture();
    const fieldId = "temp-field";
    const viewId = "temp-view";
    data.fields.push({ id: fieldId, name: "Smoke Marker", type: "text" });
    data.views.push({ id: viewId, name: "Smoke Table", kind: "table" });
    for (const [type, key, name, expected] of [
      ["remove_collection_field", "fieldName", "Smoke Marker", fieldId],
      ["remove_collection_view", "viewName", "Smoke Table", viewId],
    ]) {
      const raw = { type, blockId: "c1", [key]: name };
      const resolved = resolveCollectionTargets(raw, asBoard(state));
      expect(resolved.error).toBeUndefined();
      expect(resolved.action[type === "remove_collection_field" ? "fieldId" : "viewId"]).toBe(expected);
      expect(applyCollectionAction(state as never, resolved.action)?.ids).toEqual(["c1"]);
    }
    expect(state.blocks.c1.data.fields.some((item) => item.id === fieldId)).toBe(false);
    expect(state.blocks.c1.data.views.some((item) => item.id === viewId)).toBe(false);
  });

  it("rejects duplicate names with concrete IDs without mutating", () => {
    const { data, state } = fixture();
    data.views.push({ id: "v2", name: "Duplicate", kind: "table" }, { id: "v3", name: "Duplicate", kind: "kanban" });
    const before = JSON.stringify(state.blocks.c1.data);
    const resolved = resolveCollectionTargets({ type: "remove_collection_view", blockId: "c1", viewName: "Duplicate" }, asBoard(state));
    expect(resolved.error).toContain("v2");
    expect(resolved.error).toContain("v3");
    expect(JSON.stringify(state.blocks.c1.data)).toBe(before);
  });

  it("validates dependent field > record > view against sequential state", () => {
    const { state } = fixture();
    const commands = [
      { type: "add_collection_field", blockId: "c1", fieldId: "custom-f", name: "Issue Marker", fieldType: "text" },
      { type: "create_collection_record", blockId: "c1", recordId: "custom-r", values: { "Issue Marker": "present" } },
      { type: "add_collection_view", blockId: "c1", viewId: "custom-v", name: "Issue View", kind: "table" },
    ];
    const proposal = parseWorkspaceModelProposal(JSON.stringify({ done: true, message: "", actions: commands }), asBoard(state));
    for (const raw of proposal.actions) {
      const resolved = resolveCollectionTargets(raw, asBoard(state));
      expect(resolved.error).toBeUndefined();
      expect(applyCollectionAction(state as never, resolved.action)?.ids).toEqual(["c1"]);
    }
    expect(state.blocks.c1.data.records.find((item) => item.id === "custom-r")?.values["custom-f"]).toBe("present");
    expect(state.blocks.c1.data.views.some((item) => item.id === "custom-v")).toBe(true);
  });

  it("does not mutate state when a later dependent target is missing", () => {
    const { state } = fixture();
    const original = JSON.stringify(state);
    const missing = resolveCollectionTargets({ type: "delete_collection_record", blockId: "c1", recordName: "Missing" }, asBoard(state));
    expect(missing.error).toContain("No Collection record");
    expect(JSON.stringify(state)).toBe(original);
  });

  it("records a saved delete even if a subsequent search fails, and skips later actions", async () => {
    const { state } = fixture();
    const snapshot = { revision: 1, ...state };
    const input: WorkspaceRuntimeRequest = {
      boardId: "b1", turnId: "turn5", query: "Delete and then search", modelSelector: "model",
      authorization: "Bearer key", workspaceUserToken: "token", canMutate: true,
      signal: new AbortController().signal,
    };
    const modelProvider = { propose: vi.fn().mockResolvedValue({
      answer: JSON.stringify({ done: true, message: "", actions: [
        { type: "delete_collection_record", blockId: "c1", recordId: "r1" },
        { type: "search_collection_records", blockId: "c1", query: "r1" },
      ] }),
      conversationId: "provider-c",
    }) };
    const execute = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, body: { success: true, revision: 2, actions: [{ type: "delete_collection_record", ids: ["c1"], changed: true }] } })
      .mockResolvedValueOnce({ httpStatus: 422, body: { success: false, error: "Search failed", revision: 2, actions: [{ type: "search_collection_records", ids: [], changed: false }] } });
    const result = await runWorkspaceAgentTurn(input, { readSnapshot: async () => snapshot as never, modelProvider, execute });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0][3]).toBe(1);
    expect(execute.mock.calls[1][3]).toBe(2);
    expect(result.status).toBe("partial");
    expect(result.receipts.map((item) => item.persisted)).toEqual([true, false]);
    expect(result.receipts[0].revisionAfter).toBe(2);
  });

  it("surfaces a verified search after a saved delete through the final stream when Dify later emits no actions", async () => {
    const { state, data } = fixture();
    const primary = data.fields[0].id;
    const searchResult = {
      blockId: "c1", collectionTitle: "Smoke", fields: data.fields,
      records: [{ id: "remaining-r", values: { [primary]: "AI collection parity smoke" } }],
      recordCount: 1,
    };
    let revision = 1;
    const proposals = [
      { done: false, message: "Deleting and searching", actions: [
        { type: "delete_collection_record", blockId: "c1", recordId: "deleted-r" },
        { type: "search_collection_records", blockId: "c1", query: "AI collection parity smoke" },
      ] },
      { done: false, message: "Checking search", actions: [
        { type: "search_collection_records", blockId: "c1", query: "AI collection parity smoke" },
      ] },
      { done: true, message: "Done", actions: [] },
    ];
    const execute = vi.fn(async (_input, _turnId, _step, baseRevision, actions) => {
      expect(baseRevision).toBe(revision);
      if (actions[0].type === "delete_collection_record") {
        revision += 1;
        return { httpStatus: 200, body: { success: true, revision, actions: [
          { type: "delete_collection_record", ids: ["c1"], changed: true, summary: "deleted-r" },
        ] } };
      }
      return { httpStatus: 200, body: { success: true, revision, actions: [
        { type: "search_collection_records", ids: ["c1"], changed: false },
      ], result: searchResult } };
    });
    const input: WorkspaceRuntimeRequest = {
      boardId: "b1", turnId: "turn-read-followup", query: "Delete record then search for AI collection parity smoke",
      modelSelector: "model", authorization: "Bearer key", workspaceUserToken: "token",
      canMutate: true, signal: new AbortController().signal,
    };
    const turn = await runWorkspaceAgentTurn(input, {
      readSnapshot: async () => ({ revision, ...state }) as never,
      modelProvider: { propose: async ({ round }) => ({
        answer: JSON.stringify(proposals[round - 1]), conversationId: "provider-c",
      }) },
      execute,
    });
    expect(turn.status).toBe("completed");
    expect(turn.rounds).toBe(3);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(turn.receipts.map((receipt) => [receipt.actionType, receipt.persisted])).toEqual([
      ["delete_collection_record", true],
      ["search_collection_records", false],
      ["search_collection_records", false],
    ]);
    expect(turn.unresolvedSummaries).toEqual([]);
    expect(turn.answer).toContain("search_collection_records");
    expect(turn.answer).toContain("AI collection parity smoke");
    expect(turn.answer).toContain("Workspace-verified Collection read result");
    expect(turn.appliedSummaries).toHaveLength(1);
    const answer = JSON.stringify({
      answer: turn.answer,
      focusBlockIds: turn.focusBlockIds,
      appliedSummaries: turn.appliedSummaries,
      unresolvedSummaries: turn.unresolvedSummaries,
    });
    const event = { event: "workflow_finished", conversation_id: turn.conversationId, data: { outputs: { answer } } };
    const stream = new Response(`data: ${JSON.stringify(event)}\\n\\ndata: [DONE]\\n\\n`,
      { headers: { "content-type": "text/event-stream" } });
    const parsed = parseDifyAgentAnswer((await consumeWorkspaceChatResponse(stream, () => {})).answer);
    expect(parsed.content).toContain("search_collection_records");
    expect(parsed.content).toContain("remaining-r");
    expect(parsed.appliedSummaries).toHaveLength(1);
  });

  it("reports a failed read phase as partial and never fabricates a successful read receipt", async () => {
    const { state } = fixture();
    const input: WorkspaceRuntimeRequest = {
      boardId: "b1", turnId: "turn-search-fails", query: "Delete record, then search",
      modelSelector: "model", authorization: "Bearer key", workspaceUserToken: "token",
      canMutate: true, signal: new AbortController().signal,
    };
    const execute = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, body: { success: true, revision: 4, actions: [
        { type: "delete_collection_record", ids: ["c1"], changed: true, summary: "deleted" },
      ] } })
      .mockResolvedValueOnce({ httpStatus: 422, body: { success: false, revision: 4, error: "Search failed",
        actions: [{ type: "search_collection_records", ids: [], changed: false }] } });
    const turn = await runWorkspaceAgentTurn(input, {
      readSnapshot: async () => ({ revision: 3, ...state }) as never,
      modelProvider: { propose: async () => ({
        answer: JSON.stringify({ done: true, message: "All done", actions: [
          { type: "delete_collection_record", blockId: "c1", recordId: "r" },
          { type: "search_collection_records", blockId: "c1", query: "remaining" },
        ] }), conversationId: "provider-c",
      }) },
      execute,
    });
    expect(turn.status).toBe("partial");
    expect(turn.receipts.map((r) => r.persisted)).toEqual([true, false]);
    expect(turn.receipts[1].reason).toMatch(/Search failed/);
    expect(turn.unresolvedSummaries.join(" ")).toContain("search_collection_records");
    expect(turn.answer).not.toContain("Workspace-verified Collection read result");
  });
});
