import { describe, expect, it } from "vitest";
import { addField, addRecord, addView, createCollection, deleteRecord, removeField, setParent, setRecordValue, updateField, updateView, visibleRecords } from "../../app/workspace/collections/model";
import { exportCollectionCsv, fromTableBlock, importCollectionCsv, importCollectionJson } from "../../app/workspace/collections/io";
import { createDualTransform, type CanvasBlock } from "../../app/workspace/types/block";

describe("Workspace universal collections", () => {
  it("preserves record identities across all view switches", () => {
    let data = createCollection();
    data = addRecord(data, { [data.fields[0].id]: "Design" });
    const recordId = data.records[0].id;
    for (const view of data.views) {
      data = { ...data, activeViewId: view.id };
      expect(visibleRecords(data, view)[0].id).toBe(recordId);
    }
    data = setRecordValue(data, recordId, data.fields[0].id, "Updated");
    expect(data.records[0].values[data.fields[0].id]).toBe("Updated");
  });

  it("sorts/filters without mutating canonical order", () => {
    let data = createCollection();
    const title = data.fields[0].id, status = data.fields[1].id;
    data = addRecord(data, { [title]: "B", [status]: "Done" });
    data = addRecord(data, { [title]: "A", [status]: "To do" });
    const view = { ...data.views[0], filter: { fieldId: status, value: "Done" }, sort: { fieldId: title, direction: "asc" as const } };
    expect(visibleRecords(data, view).map((r) => r.values[title])).toEqual(["B"]);
    expect(data.records.map((r) => r.values[title])).toEqual(["B", "A"]);
  });

  it("rejects circular parent changes and detaches children on delete", () => {
    let data = createCollection();
    data = addRecord(addRecord(data));
    const [a, b] = data.records.map((r) => r.id);
    data = setParent(data, b, a);
    expect(setParent(data, a, b)).toBe(data);
    data = deleteRecord(data, a);
    expect(data.records[0].parentId).toBeNull();
  });

  it("removes field values and stale view mappings", () => {
    let data = createCollection();
    const id = data.fields[1].id;
    data = addRecord(data, { [id]: "Done" });
    data = updateView(data, data.views[0].id, { filter: { fieldId: id, value: "Done" } });
    data = removeField(data, id);
    expect(data.records[0].values[id]).toBeUndefined();
    expect(data.views[0].filter).toBeUndefined();
    expect(data.fields.some((f) => f.id === id)).toBe(false);
  });

  it("imports and exports CSV with quotes, commas and newlines", () => {
    const data = importCollectionCsv('"Name","Note"\n"Hello, world","line 1\nline 2"');
    expect(data.records[0].values[data.fields[0].id]).toBe("Hello, world");
    const importedAgain = importCollectionCsv(exportCollectionCsv(data));
    expect(importedAgain.fields.map((f) => importedAgain.records[0].values[f.id])).toEqual(
      data.fields.map((f) => data.records[0].values[f.id]));
  });

  it("guards JSON payloads and spreadsheet formula injection", () => {
    expect(() => importCollectionJson('{"version":2}')).toThrow();
    const data = importCollectionCsv('"Name"\n"=1+1"');
    expect(exportCollectionCsv(data)).toContain("'=1+1");
  });

  it("converts a table to an independent collection", () => {
    const table: CanvasBlock<"table"> = {
      id: "table1", type: "table", transform: createDualTransform({ x: 0, y: 0, w: 100, h: 100, rotation: 0, zIndex: 0 }),
      createdAt: 1, updatedAt: 1,
      data: { rows: 3, cols: 2, headerRow: true, cells: [["Name", "Status"], ["Plan", "Todo"], ["Ship", "Done"]], columnTypes: ["text", "select"], columnSelectOptions: { 1: [{ id: "Todo", label: "Todo", color: "" }, { id: "Done", label: "Done", color: "" }] } },
    };
    const collection = fromTableBlock(table);
    expect(collection.records).toHaveLength(2);
    expect(collection.fields[1].type).toBe("select");
    expect(table.data.cells[1][0]).toBe("Plan");
  });
});
