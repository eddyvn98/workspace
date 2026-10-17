import { describe, expect, it } from "vitest";
import { addField, createCollection, updateField, visibleRecords } from "@/app/workspace/collections/model";
import { getCollectionValue } from "@/app/workspace/collections/collectionRelations";

describe("Collection 5000-record indexed lookup projection", () => {
  const setup = () => {
    let data = createCollection();
    data = addField(data, "Related", "relation");
    data = addField(data, "Related name", "lookup");
    data = addField(data, "Related count", "rollup");
    const [name] = data.fields;
    const relation = data.fields.find(field => field.name === "Related")!;
    const lookup = data.fields.find(field => field.name === "Related name")!;
    const count = data.fields.find(field => field.name === "Related count")!;
    data = updateField(data, relation.id, { relationMultiple: true });
    data = updateField(data, lookup.id, { relationFieldId: relation.id, targetFieldId: name.id });
    data = updateField(data, count.id, { relationFieldId: relation.id, rollupOperation: "count" });
    data.records = Array.from({ length: 5000 }, (_, i) => ({
      id: "id-" + i,
      values: {
        [name.id]: "Record " + i,
        [relation.id]: i >= 2 ? JSON.stringify(["id-" + (i - 1), "id-" + (i - 2)]) : "[]",
      },
    }));
    return { data, name, lookup, count };
  };
  it("keeps all IDs and computed relation values stable without persisting duplicate fields", () => {
    const { data, lookup, count } = setup();
    const before = data.records;
    const rows = visibleRecords(data, data.views[0]);
    expect(rows).toHaveLength(5000);
    expect(rows.map(item => item.id)).toEqual(before.map(item => item.id));
    expect(rows[4999].values[lookup.id]).toBe("Record 4997, Record 4998");
    expect(rows[4999].values[count.id]).toBe("2");
    expect(getCollectionValue(data, before[4999], lookup)).toBe(rows[4999].values[lookup.id]);
    expect(before[4999].values[lookup.id]).toBeUndefined();
  });
  it("respects target source ordering rather than relation-id input ordering", () => {
    const { data, lookup } = setup();
    const related = data.fields.find(field => field.name === "Related")!;
    data.records[100].values[related.id] = JSON.stringify(["id-90", "id-20", "id-50"]);
    expect(visibleRecords(data, data.views[0])[100].values[lookup.id])
      .toBe("Record 20, Record 50, Record 90");
  });
});
