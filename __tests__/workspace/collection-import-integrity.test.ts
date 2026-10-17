import { describe, expect, it } from "vitest";
import { createCollection, setParent } from "@/app/workspace/collections/model";
import { importCollectionCsv, importCollectionJson } from "@/app/workspace/collections/io";

describe("Collection untrusted import integrity", () => {
  const valid = () => {
    const data = createCollection();
    return { ...data, records: [{ id: "a", values: { [data.fields[0].id]: "One" } },
      { id: "b", values: { [data.fields[0].id]: "Two" }, parentId: "a" }] };
  };
  it("accepts a valid round trip without remapping record and field IDs", () => {
    const expected = valid(), actual = importCollectionJson(JSON.stringify(expected));
    expect(actual.records.map(r => r.id)).toEqual(["a", "b"]);
    expect(actual.records[1].parentId).toBe("a");
  });
  it("preserves compatibility with legacy imports lacking title and activeViewId", () => {
    const { title: unusedTitle, activeViewId: unusedView, ...old } = valid();
    const imported = importCollectionJson(JSON.stringify(old));
    expect(imported.title).toBe("Untitled collection");
    expect(imported.activeViewId).toBe(imported.views[0].id);
    expect(imported.records.map(row => row.id)).toEqual(["a", "b"]);
    void unusedTitle;
    void unusedView;
  });
  it("rejects duplicate record, field or view IDs", () => {
    const v = valid();
    expect(() => importCollectionJson(JSON.stringify({ ...v, records: [v.records[0], v.records[0]] }))).toThrow(/duplicate/i);
    expect(() => importCollectionJson(JSON.stringify({ ...v, fields: [v.fields[0], v.fields[0]] }))).toThrow(/duplicate/i);
    expect(() => importCollectionJson(JSON.stringify({ ...v, views: [v.views[0], v.views[0]] }))).toThrow(/duplicate/i);
  });
  it("rejects non-string values and malformed formulas in raw record values", () => {
    const v = valid();
    const row = { ...v.records[0], values: { [v.fields[0].id]: { dangerous: true } } };
    expect(() => importCollectionJson(JSON.stringify({ ...v, records: [row] }))).toThrow(/record values/i);
    expect(() => importCollectionJson(JSON.stringify({ ...v, records: [{ ...v.records[0], values: [] }] }))).toThrow();
  });
  it("rejects existing cyclic ancestry", () => {
    const v = valid();
    const records = [{ ...v.records[0], parentId: "b" }, v.records[1]];
    expect(() => importCollectionJson(JSON.stringify({ ...v, records }))).toThrow(/cycle/i);
  });
  it("rejects cyclic or dangling Gantt dependencies before replacing Collection data", () => {
    const v = valid();
    expect(() => importCollectionJson(JSON.stringify({ ...v, records: [
      { ...v.records[0], dependsOn: ["b"] }, { ...v.records[1], dependsOn: ["a"] },
    ] }))).toThrow(/dependency cycle/i);
    expect(() => importCollectionJson(JSON.stringify({ ...v, records: [
      { ...v.records[0], dependsOn: ["missing"] }, v.records[1],
    ] }))).toThrow(/dependency reference/i);
  });
  it("never loops when reparenting older corrupted parent graphs", () => {
    const v = valid();
    const malformed = { ...v, records: [...v.records, { id: "c", values: {}, parentId: "d" },
      { id: "d", values: {}, parentId: "c" }] };
    expect(setParent(malformed, "a", "c")).toBe(malformed);
  });
  it("rejects a forged view or active view that is not present", () => {
    const v = valid();
    expect(() => importCollectionJson(JSON.stringify({ ...v, activeViewId: "missing" }))).toThrow(/active view/i);
    expect(() => importCollectionJson(JSON.stringify({ ...v, views: [{ ...v.views[0], kind: "fabricated" }] }))).toThrow(/view/i);
  });
  it("rejects truncated CSV rather than silently losing rows", () => {
    const csv = "Name\n" + Array.from({ length: 5001 }, (_, i) => "Record " + i).join("\n");
    expect(() => importCollectionCsv(csv)).toThrow(/limit/i);
  });
});
