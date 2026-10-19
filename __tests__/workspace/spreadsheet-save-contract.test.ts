import { afterEach, describe, expect, it, vi } from "vitest";
import { tableDataSignature } from "@/app/workspace/components/table/workspaceSpreadsheetEditorUtils";
import { flushWorkspaceEditors, registerWorkspaceEditorFlush } from "@/app/workspace/utils/workspaceEditorFlush";
import { hasSpreadsheetBlock } from "@/lib/workspace/spreadsheetGuard";
import { importedPayload, replacementPatch } from "@/lib/office/spreadsheet/payload";
import type { TableBlockPayload } from "@/app/workspace/types/table";

const base: TableBlockPayload = { rows: 1, cols: 1, cells: [["a"]], mode: "spreadsheet" };
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));

describe("Spreadsheet save boundary", () => {
  it.each([
    { frozen: { type: "rangeRow", row: 0 } }, { borderInfo: [{ style: "1" }] },
    { cellNotes: { "0_0": { value: "note" } } }, { cellWrap: { "0_0": true } },
    { dataValidations: { "0_0": { type: "dropdown", value1: "a,b" } } },
    { conditionalFormats: [{ type: "default" }] }, { sheetHidden: true },
    { cellContents: [[{ version: 1, blocks: [{ type: "paragraph", runs: [{ text: "a", marks: { strikethrough: true } }] }] }]] },
  ])("detects non-text changes without requiring a saved sheets array", (patch) => {
    expect(tableDataSignature({ ...base, ...patch } as TableBlockPayload)).not.toBe(tableDataSignature(base));
  });
  it("ignores object insertion order and undefined defaults to avoid remounting after every local save", () => {
    expect(tableDataSignature(base)).toBe(tableDataSignature({ mode: "spreadsheet", cells: [["a"]], cols: 1, rows: 1, frozen: undefined }));
  });
  it("flushes board-scoped editors before a caller continues", async () => {
    const order: string[] = [], other = vi.fn();
    cleanup.push(registerWorkspaceEditorFlush("a", async () => { await Promise.resolve(); order.push("cell"); }));
    cleanup.push(registerWorkspaceEditorFlush("a", () => { order.push("sheet"); }));
    cleanup.push(registerWorkspaceEditorFlush("b", other));
    expect(await flushWorkspaceEditors("a")).toBe(true); order.push("database");
    expect(order).toEqual(["cell", "sheet", "database"]); expect(other).not.toHaveBeenCalled();
  });
  it("fails closed when a mounted editor cannot commit; cleanup removes only its lease", async () => {
    const release = registerWorkspaceEditorFlush("a", () => false); cleanup.push(release);
    expect(await flushWorkspaceEditors("a")).toBe(false); release();
    const good = vi.fn(); cleanup.push(registerWorkspaceEditorFlush("a", good)); release();
    expect(await flushWorkspaceEditors("a")).toBe(true); expect(good).toHaveBeenCalledOnce();
  });
  it("replaces all sheets and clears old validation/links rather than shallow-merging stale metadata", () => {
    const old = { ...base, cellLinks: { "0_0": { linkType: "webpage", linkAddress: "https://example.com" } }, sheets: [{ id: "old", name: "Old", data: base }], activeSheetId: "old" };
    const next = importedPayload({ sheets: [{ id: "new", name: "New", data: { ...base, cells: [["new"]] } }], activeSheetId: "new", warnings: [] });
    const result = { ...old, ...replacementPatch(old, next) };
    expect(result.cellLinks).toBeUndefined(); expect(result.sheets?.map((s) => s.id)).toEqual(["new"]); expect(result.cells).toEqual([["new"]]);
  });
  it("fences both legacy spreadsheet blocks and multi-sheet blocks from whole-block realtime writes", () => {
    expect(hasSpreadsheetBlock({ a: { type: "table", data: base } })).toBe(true);
    expect(hasSpreadsheetBlock([{ type: "table", data: { sheets: [] } }])).toBe(true);
    expect(hasSpreadsheetBlock({ a: { type: "table", data: { mode: "document" } } })).toBe(false);
    expect(hasSpreadsheetBlock(null)).toBe(false);
  });
});
