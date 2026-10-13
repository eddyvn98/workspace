import { describe, expect, it } from "vitest";
import { addField, createCollection, setRecordValue, updateField, visibleRecords } from "@/app/workspace/collections/model";
import { calculateCollectionAggregate } from "@/app/workspace/collections/collectionFormula";
import { validateCollectionTarget } from "@/lib/workspace-agent/collectionActionValidation";
describe("Collection safe formula and visible-row aggregation", () => {
  function prepare() {
    let data = createCollection();
    data = addField(data, "A", "number");
    data = addField(data, "B", "number");
    data = addField(data, "Computed", "formula");
    const a = data.fields.find(f => f.name === "A")!, b = data.fields.find(f => f.name === "B")!;
    const formula = data.fields.find(f => f.name === "Computed")!;
    data = updateField(data, formula.id, { formulaOperation: "sum", formulaFieldIds: [a.id, b.id] });
    data.records = [{ id: "stable", values: { [a.id]: "10", [b.id]: "5" } }];
    return { data, a, b, formula };
  }
  it("projects formulas without persisting values and recomputes after source edits", () => {
    let { data, a, formula } = prepare();
    expect(visibleRecords(data, data.views[0])[0].values[formula.id]).toBe("15");
    expect(data.records[0].values[formula.id]).toBeUndefined();
    data = setRecordValue(data, "stable", a.id, "20");
    expect(visibleRecords(data, data.views[0])[0].values[formula.id]).toBe("25");
    expect(setRecordValue(data, "stable", formula.id, "999")).toBe(data);
  });
  it("handles division-by-zero, no eval, and aggregates only visible rows", () => {
    const { data, a, b, formula } = prepare();
    const division = updateField(data, formula.id, { formulaOperation: "divide" });
    const zero = setRecordValue(division, "stable", b.id, "0");
    expect(visibleRecords(zero, zero.views[0])[0].values[formula.id]).toBe("");
    expect(calculateCollectionAggregate(data.records, { fieldId: a.id, operation: "sum" })).toBe("10");
    expect(calculateCollectionAggregate(data.records, { fieldId: a.id, operation: "average" })).toBe("10");
  });
  it("AI rejects formula writes and recursive references", () => {
    const { data, formula, a } = prepare();
    const board = { blocks: { c1: { type: "collection", data } } };
    expect(validateCollectionTarget({ type: "update_collection_record", blockId: "c1",
      recordId: "stable", values: { [formula.id]: "123" } }, board as never)).toMatch(/computed/i);
    expect(validateCollectionTarget({ type: "add_collection_field", blockId: "c1",
      fieldId: "new", name: "Bad", fieldType: "formula", formulaOperation: "sum",
      formulaFieldIds: [a.id, formula.id] }, board as never)).toMatch(/non-formula/i);
  });
});
