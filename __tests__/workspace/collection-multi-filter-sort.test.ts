import { describe, expect, it } from "vitest";
import { createCollection, removeField, viewFilters, viewSorts, visibleRecords } from "@/app/workspace/collections/model";
import { validateWorkspaceRuntimeAction } from "@/lib/workspace-agent/actionSchema";
import { resolveCollectionTargets } from "@/lib/workspace-agent/collectionTargetResolution";
import { validateCollectionTarget } from "@/lib/workspace-agent/collectionActionValidation";
import { applyCollectionAction } from "@/app/api/workspaces/[id]/agent/collectionOperations";

describe("Collection multiple filters/sorts compatibility", () => {
  function fixture() {
    const data = createCollection();
    const [name, status, start] = data.fields;
    const rows = [["B", "Done", "2026-10-12"], ["A", "Done", "2026-10-12"],
      ["C", "To do", "2026-10-12"], ["D", "Done", "2026-10-13"]];
    data.records = rows.map(([n, s, date], i) =>
      ({ id: "r" + i, values: { [name.id]: n, [status.id]: s, [start.id]: date } }));
    return data;
  }
  it("reads existing persisted legacy scalar settings unchanged", () => {
    const d = fixture();
    const view = { ...d.views[0], filter: { fieldId: d.fields[1].id, value: "Done" },
      sort: { fieldId: d.fields[0].id, direction: "desc" as const } };
    expect(viewFilters(view)).toHaveLength(1);
    expect(viewSorts(view)).toHaveLength(1);
    expect(visibleRecords(d, view).map(r => r.id)).toEqual(["r3", "r0", "r1"]);
  });
  it("keeps records visible while a blank new filter is being configured", () => {
    const d = fixture();
    const view = { ...d.views[0], filters: [
      { fieldId: d.fields[1].id, value: "" },
      { fieldId: d.fields[0].id, value: "  " }], sorts: [] };
    expect(visibleRecords(d, view)).toHaveLength(4);
    expect(visibleRecords(d, { ...view, filters: [
      ...view.filters, { fieldId: d.fields[2].id, value: "2026-10-12" }] })).toHaveLength(3);
    // The unfinished rows are persisted, not discarded or turned into an "is empty" operator.
    expect(view.filters).toHaveLength(2);
  });
  it("uses ordered multi-column sort with multi-condition AND filtering", () => {
    const d = fixture();
    const view = { ...d.views[0], filters: [
      { fieldId: d.fields[1].id, value: "Done" },
      { fieldId: d.fields[2].id, value: "2026-10-12" }],
      sorts: [{ fieldId: d.fields[1].id, direction: "asc" as const },
        { fieldId: d.fields[0].id, direction: "asc" as const }] };
    expect(visibleRecords(d, view).map(r => r.id)).toEqual(["r1", "r0"]);
    expect(visibleRecords(d, { ...view, filters: [], sorts: [] })).toHaveLength(4);
  });
  it("removes deleted fields from ordered conditions without changing identities", () => {
    const d = fixture();
    const id = d.fields[1].id;
    const originalViewId = d.views[0].id;
    d.views[0].filters = [{ fieldId: id, value: "Done" }];
    d.views[0].sorts = [{ fieldId: id, direction: "asc" }];
    const next = removeField(d, id);
    expect(next.views[0].id).toBe(originalViewId);
    expect(next.records.map(r => r.id)).toEqual(d.records.map(r => r.id));
    expect(next.views[0].filters).toEqual([]);
    expect(next.views[0].sorts).toEqual([]);
  });
  it("accepts unique field names in AI array commands; persists stable field IDs", () => {
    const data = fixture();
    const state = { blocks: { c1: { type: "collection", data } } };
    const action = { type: "configure_collection_view", blockId: "c1", viewId: data.views[0].id,
      filters: [{ fieldId: "Status", value: "Done" }], sorts: [{ fieldId: "Name", direction: "asc" }] };
    expect(validateWorkspaceRuntimeAction(action)).toBeNull();
    const resolved = resolveCollectionTargets(action, state as never);
    expect(resolved.error).toBeUndefined();
    expect(resolved.action.filters).toEqual([{ fieldId: data.fields[1].id, value: "Done" }]);
    expect(validateCollectionTarget(resolved.action, state as never)).toBeNull();
    const applied = applyCollectionAction({ ...state, blockOrder: [], connectors: {}, title: "board" } as never, resolved.action);
    expect(applied?.ids, applied?.reason).toEqual(["c1"]);
    expect(state.blocks.c1.data.views[0].filters?.[0].fieldId).toBe(data.fields[1].id);
    expect(state.blocks.c1.data.views[0].sorts?.[0].fieldId).toBe(data.fields[0].id);
  });
  it("rejects missing field IDs and duplicate conditions before mutation", () => {
    const data = fixture();
    const state = { blocks: { c1: { type: "collection", data } } };
    const id = data.fields[0].id;
    const base = { type: "configure_collection_view", blockId: "c1", viewId: data.views[0].id };
    expect(validateCollectionTarget({ ...base, filters: [{ fieldId: "missing", value: "A" }] }, state as never)).toMatch(/fieldId/);
    expect(validateCollectionTarget({ ...base, sorts: [{ fieldId: id, direction: "asc" }, { fieldId: id, direction: "desc" }] }, state as never)).toMatch(/Duplicate/);
  });
});
