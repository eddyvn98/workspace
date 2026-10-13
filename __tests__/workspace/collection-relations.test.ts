import { describe, expect, it } from "vitest";
import { addField, createCollection, deleteRecord, setRecordValue, updateField, visibleRecords } from "@/app/workspace/collections/model";
import { getCollectionValue } from "@/app/workspace/collections/collectionRelations";
import { validateCollectionTarget } from "@/lib/workspace-agent/collectionActionValidation";
describe("Collection relation and lookup engine", () => {
  function setup() {
    let data = createCollection();
    data = addField(data, "Owner", "relation");
    data = addField(data, "Owner name", "lookup");
    const relation = data.fields.find(f => f.name === "Owner")!;
    const lookup = data.fields.find(f => f.name === "Owner name")!;
    data = updateField(data, lookup.id, { relationFieldId: relation.id, targetFieldId: data.fields[0].id });
    const name = data.fields[0].id;
    data.records = [{ id: "a", values: { [name]: "Task" } }, { id: "b", values: { [name]: "Parent" } }];
    return { data, relation, lookup, name };
  }
  it("projects live lookups, never persists duplicate values or loses stable IDs", () => {
    let { data, relation, lookup, name } = setup();
    data = setRecordValue(data, "a", relation.id, "b");
    expect(getCollectionValue(data, data.records[0], lookup)).toBe("Parent");
    expect(data.records[0].values[lookup.id]).toBeUndefined();
    data = setRecordValue(data, "b", name, "Renamed");
    expect(visibleRecords(data, data.views[0])[0].values[lookup.id]).toBe("Renamed");
    expect(data.records.map(record => record.id)).toEqual(["a", "b"]);
    expect(setRecordValue(data, "a", lookup.id, "Forged")).toBe(data);
  });
  it("clears inbound relation references after deletion", () => {
    let { data, relation, lookup } = setup();
    data = setRecordValue(data, "a", relation.id, "b");
    data = deleteRecord(data, "b");
    expect(data.records).toHaveLength(1);
    expect(data.records[0].values[relation.id]).toBe("");
    expect(getCollectionValue(data, data.records[0], lookup)).toBe("");
  });
  it("AI validation rejects computed writes, dangling IDs and invalid lookup mapping", () => {
    const { data, relation, lookup } = setup();
    const state = { blocks: { c1: { type: "collection", data } } };
    const base = { type: "update_collection_record", blockId: "c1", recordId: "a" };
    expect(validateCollectionTarget({ ...base, values: { [lookup.id]: "Forged" } }, state as never))
      .toMatch(/computed/i);
    expect(validateCollectionTarget({ ...base, values: { [relation.id]: "missing" } }, state as never))
      .toMatch(/related recordId/i);
    expect(validateCollectionTarget({ type: "add_collection_field", blockId: "c1",
      fieldId: "new-lookup", name: "Bad", fieldType: "lookup",
      relationFieldId: "missing", targetFieldId: data.fields[0].id }, state as never))
      .toMatch(/relationFieldId/);
  });
});
