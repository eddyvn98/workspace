import { describe, expect, it } from "vitest";
import { createOfficeBlock } from "@/lib/office/factory";
import { listOfficeFilesFromBoard, officeEditorUrl, officeKindOfBlock, officeFileAccess } from "@/lib/office/catalog";

describe("Office blocks share the Workspace persistence contract", () => {
  it.each(["document", "spreadsheet", "presentation"] as const)(
    "creates a %s as a native Workspace block", (kind) => {
      const block = createOfficeBlock(kind, "Sample");
      expect(block.officeTitle).toBe("Sample");
      expect(block.id).toBeTruthy();
      expect(block.transform).toBeDefined();
      expect(block.type).toBe({ document: "doc", spreadsheet: "table", presentation: "slideDeck" }[kind]);
      if (kind === "spreadsheet") expect(block.data).toHaveProperty("mode", "spreadsheet");
      if (kind === "presentation") expect(block.data).toHaveProperty("slideOrder");
    },
  );

  it("lists only editable Office block types, skipping embedded and structural tables", () => {
    const files = listOfficeFilesFromBoard({
      id: "board-1", title: "Project board", updatedAt: new Date("2026-10-01T00:00:00Z"),
      blockOrder: ["doc", "embedded", "table", "layout", "slides", "map"],
      blocks: {
        doc: { id: "doc", type: "doc", data: { html: "<p>Hey</p>" }, updatedAt: 1750000000000 },
        embedded: { id: "embedded", type: "table", embeddedInDocId: "doc", data: {} },
        table: { id: "table", type: "table", data: { mode: "spreadsheet" } },
        layout: { id: "layout", type: "table", data: { disableCellAttachment: true } },
        slides: { id: "slides", type: "slideDeck", data: { title: "Quarterly" } },
        map: { id: "map", type: "text" },
      },
    }, "EDITOR");
    expect(files.map((file) => file.blockId)).toEqual(["doc", "table", "slides"]);
    expect(files.map((file) => file.kind)).toEqual(["document", "spreadsheet", "presentation"]);
    expect(files.map((file) => file.title)).toEqual([
      "Project board - Document 1", "Project board - Spreadsheet 1", "Quarterly",
    ]);
    expect(files.every((file) => file.viewerRole === "EDITOR")).toBe(true);
  });

  it("handles legacy array blocks, missing order and explicit block names", () => {
    const files = listOfficeFilesFromBoard({
      id: "old", title: "My workspace", updatedAt: "2026-10-01T00:00:00Z",
      blocks: [{ id: "a", type: "doc", officeTitle: "Specification" }],
    }, "OWNER");
    expect(files).toHaveLength(1);
    expect(files[0].title).toBe("Specification");
    expect(officeKindOfBlock({ type: "table", embeddedInDocId: "a" })).toBe(null);
  });

  it("fails closed for missing role, mismatched blocks and only permits viewer reads", () => {
    const board = { viewerRole: "VIEWER", blocks: { doc1: { id: "doc1", type: "doc" } } };
    expect(officeFileAccess(null, "document", "doc1").authorized).toBe(false);
    expect(officeFileAccess({ ...board, viewerRole: undefined }, "document", "doc1").authorized).toBe(false);
    expect(officeFileAccess(board, "spreadsheet", "doc1").authorized).toBe(false);
    expect(officeFileAccess(board, "document", "missing").authorized).toBe(false);
    expect(officeFileAccess(board, "document", "doc1")).toEqual({ authorized: true, viewer: true });
    expect(officeFileAccess({ ...board, viewerRole: "EDITOR" }, "document", "doc1"))
      .toEqual({ authorized: true, viewer: false });
  });

  it("builds an encoded deep link to the same board/block", () => {
    expect(officeEditorUrl("document", "one + two", "d&1")).toBe(
      "/office/document?boardId=one+%2B+two&blockId=d%261",
    );
  });
});
