import { describe, expect, it } from "vitest";
import { mergeBoardContent, type BoardContent } from "../../app/workspace/utils/mergeBoardConflict";
import { addRecord, createCollection, setRecordValue } from "../../app/workspace/collections/model";
import { hasCollectionBlock } from "../../lib/workspace/collectionGuard";

function board(data: ReturnType<typeof createCollection>): BoardContent {
  return { blocks: { collection: { id: "collection", type: "collection", data, transform: { computed: null, override: null } } }, blockOrder: ["collection"], connectors: {} };
}
const getData = (boardValue: BoardContent) => (boardValue.blocks.collection as { data: ReturnType<typeof createCollection> }).data;

describe("Collection REST concurrent save reconciliation", () => {
  it("keeps simultaneous changes to different existing records", () => {
    let baseData = createCollection();
    const nameId = baseData.fields[0].id;
    baseData = addRecord(addRecord(baseData));
    const [first, second] = baseData.records.map((r) => r.id);
    const base = board(baseData);
    const mine = board(setRecordValue(baseData, first, nameId, "first user"));
    const theirs = board(setRecordValue(baseData, second, nameId, "second user"));
    const merged = mergeBoardContent(base, mine, theirs);
    expect(merged.conflicts).toBe(0);
    const values = getData(merged).records;
    expect(values.find((r) => r.id === first)?.values[nameId]).toBe("first user");
    expect(values.find((r) => r.id === second)?.values[nameId]).toBe("second user");
    expect(getData(merged).records.map((r) => r.id)).toEqual([first, second]);
  });

  it("keeps simultaneous edits to different fields of the same record", () => {
    let d = createCollection();
    d = addRecord(d);
    const recordId = d.records[0].id, [name, status] = d.fields;
    const merged = mergeBoardContent(board(d), board(setRecordValue(d, recordId, name.id, "New name")),
      board(setRecordValue(d, recordId, status.id, "Done")));
    expect(merged.conflicts).toBe(0);
    expect(getData(merged).records[0].values[name.id]).toBe("New name");
    expect(getData(merged).records[0].values[status.id]).toBe("Done");
  });

  it("flags same-cell edits instead of silently overwriting", () => {
    let d = addRecord(createCollection());
    const id = d.records[0].id, field = d.fields[0].id;
    const merged = mergeBoardContent(board(d), board(setRecordValue(d, id, field, "Mine")),
      board(setRecordValue(d, id, field, "Theirs")));
    expect(merged.conflicts).toBe(1);
    expect(merged.items).toHaveLength(1);
    expect(getData(merged).records[0].values[field]).toBe("Theirs");
  });

  it("flags delete vs edit, preserving server deletion", () => {
    const d = addRecord(createCollection());
    const id = d.records[0].id;
    const local = setRecordValue(d, id, d.fields[0].id, "New");
    const remote = { ...d, records: [] };
    const merged = mergeBoardContent(board(d), board(local), board(remote));
    expect(merged.conflicts).toBe(1);
    expect(getData(merged).records).toHaveLength(0);
  });

  it("retains independently added records from both writers", () => {
    const d = createCollection();
    const mine = addRecord(d);
    const theirs = addRecord(d);
    const merged = mergeBoardContent(board(d), board(mine), board(theirs));
    expect(merged.conflicts).toBe(0);
    expect(getData(merged).records).toHaveLength(2);
  });

  it("keeps unrelated blocks atomic and protects Yjs server endpoint scope", () => {
    expect(hasCollectionBlock(board(createCollection()).blocks)).toBe(true);
    expect(hasCollectionBlock([{ type: "text" }])).toBe(false);
    expect(hasCollectionBlock(null)).toBe(false);
    const base: BoardContent = { blocks: { text: { data: "base" } }, blockOrder: ["text"], connectors: {} };
    const mine = { ...base, blocks: { text: { data: "mine" } } };
    const theirs = { ...base, blocks: { text: { data: "theirs" } } };
    const merged = mergeBoardContent(base, mine, theirs);
    expect(merged.conflicts).toBe(1);
    expect(merged.blocks.text).toEqual({ data: "theirs" });
  });

  it("persists current view, field IDs and values through JSON snapshot/reload", () => {
    let d = createCollection();
    d = addRecord(d);
    d = setRecordValue(d, d.records[0].id, d.fields[0].id, "Retained");
    d = { ...d, activeViewId: d.views.find((v) => v.kind === "kanban")!.id };
    const reloaded = JSON.parse(JSON.stringify(board(d))) as BoardContent;
    expect(getData(reloaded).activeViewId).toBe(d.activeViewId);
    expect(getData(reloaded).records[0].values[d.fields[0].id]).toBe("Retained");
  });
});
