import { describe, expect, it, vi } from "vitest";
import { createCollection } from "@/app/workspace/collections/model";
import { applyCollectionAction } from "@/app/api/workspaces/[id]/agent/collectionOperations";
import { resolveCollectionTargets } from "@/lib/workspace-agent/collectionTargetResolution";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
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
});
