import { describe, expect, it } from "vitest";
import { createCollection } from "@/app/workspace/collections/model";
import { listCollectionApps } from "@/app/workspace/collections/collectionAppListing";

describe("standalone Collection app index", () => {
  it("links to original Workspace block ids without cloning records", () => {
    const data = createCollection();
    data.title = "Project tracker";
    data.records.push({ id: "record-1", values: {} });
    const result = listCollectionApps([{
      id: "board-1",
      title: "Main workspace",
      updatedAt: "2026-10-19T00:00:00.000Z",
      blocks: {
        "coll-1": { id: "coll-1", type: "collection", data },
        "text-1": { id: "text-1", type: "text", data: { markdown: "Private note" } },
      },
    }]);
    expect(result).toEqual([{
      boardId: "board-1",
      blockId: "coll-1",
      boardTitle: "Main workspace",
      title: "Project tracker",
      recordCount: 1,
      viewCount: data.views.length,
      updatedAt: "2026-10-19T00:00:00.000Z",
    }]);
    expect(JSON.stringify(result)).not.toContain("Private note");
    expect(JSON.stringify(result)).not.toContain("record-1");
  });

  it("ignores malformed blocks and non-object board snapshots", () => {
    expect(listCollectionApps([
      { id: "bad", title: "Invalid", updatedAt: new Date(), blocks: [] },
      { id: "empty", title: "Empty", updatedAt: new Date(), blocks: null },
      { id: "partial", title: "Partial", updatedAt: new Date(), blocks: {
        a: null, b: { type: "collection", data: {} },
      } },
    ])).toEqual([]);
  });
});
