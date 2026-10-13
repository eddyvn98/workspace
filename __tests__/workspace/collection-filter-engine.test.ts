import { describe, expect, it } from "vitest";
import { createCollection, visibleRecords } from "@/app/workspace/collections/model";
import { validateCollectionTarget } from "@/lib/workspace-agent/collectionActionValidation";
import { validateWorkspaceRuntimeAction } from "@/lib/workspace-agent/actionSchema";
describe("Collection compound operator filters", () => {
  const prepare = () => {
    const data = createCollection();
    const [name, status, date] = data.fields;
    data.records = [
      { id: "r1", values: { [name.id]: "Original row", [status.id]: "To do", [date.id]: "2026-10-12" } },
      { id: "r2", values: { [name.id]: "Other row", [status.id]: "Done", [date.id]: "2026-10-13" } },
    ];
    return data;
  };
  it("retains default exact AND for legacy saved views", () => {
    const data = prepare();
    const view = { ...data.views[0], filter: { fieldId: data.fields[1].id, value: "Done" } };
    expect(visibleRecords(data, view).map(r => r.id)).toEqual(["r2"]);
  });
  it("combines multiple operators on the same field with AND, or different fields with OR", () => {
    const data = prepare();
    const [name, status, date] = data.fields;
    const filters = [
      { fieldId: date.id, operator: "gte" as const, value: "2026-10-12" },
      { fieldId: date.id, operator: "lt" as const, value: "2026-10-13" },
    ];
    expect(visibleRecords(data, { ...data.views[0], filters }).map(r => r.id)).toEqual(["r1"]);
    const any = [{ fieldId: name.id, operator: "contains" as const, value: "original" },
      { fieldId: status.id, operator: "eq" as const, value: "Done" }];
    expect(visibleRecords(data, { ...data.views[0], filters: any, filterLogic: "or" }).map(r => r.id))
      .toEqual(["r1", "r2"]);
  });
  it("matches empty/nonempty without requiring values; skips unfinished draft rows", () => {
    const data = prepare(); const id = data.fields[4].id;
    expect(visibleRecords(data, { ...data.views[0], filters: [{ fieldId: id, operator: "empty", value: "" }] }))
      .toHaveLength(2);
    expect(visibleRecords(data, { ...data.views[0], filters: [{ fieldId: id, value: "" }] }))
      .toHaveLength(2);
  });
  it("validates typed AI operators and rejects mismatched field types", () => {
    const data = prepare(); const board = { blocks: { c1: { type: "collection", data } } };
    const base = { type: "configure_collection_view", blockId: "c1", viewId: data.views[0].id,
      filters: [{ fieldId: data.fields[2].id, operator: "gte", value: "2026-10-12" }], filterLogic: "or" };
    expect(validateWorkspaceRuntimeAction(base)).toBeNull();
    expect(validateCollectionTarget(base, board as never)).toBeNull();
    expect(validateCollectionTarget({ ...base, filters: [{ fieldId: data.fields[0].id, operator: "gt", value: "X" }] }, board as never))
      .toMatch(/operator/i);
  });
});
