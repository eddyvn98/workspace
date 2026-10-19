import type { CanvasBlock } from "@/app/workspace/types/block";
import type { TableBlockPayload, TableWorkbookSheet } from "@/app/workspace/types/table";
import type { WorkbookImport } from "./xlsx";
import { assertWorkbook, SHEET_LIMITS } from "./limits";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Identity-neutral workbook backup. Never restore its old board/block IDs. */
export function writeNativeBackup(block: CanvasBlock<"table">, title: string): string {
  const text = JSON.stringify({
    version: 1, title, blocks: { [block.id]: block }, blockOrder: [block.id],
    connectors: {}, exportedAt: Date.now(),
  }, null, 2);
  if (new TextEncoder().encode(text).length > SHEET_LIMITS.fileBytes) {
    throw new Error("Native backup exceeds 10 MiB. Reduce the workbook before exporting.");
  }
  return text;
}

/** Accept only the single-table backup written by this app, not arbitrary
 * Workspace canvas JSON. Imported data replaces the current block's cells
 * but never changes its identity or references to its containing board. */
export function readNativeBackup(bytes: Uint8Array): WorkbookImport {
  if (bytes.length > SHEET_LIMITS.fileBytes) throw new Error("Native backup exceeds 10 MiB.");
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("Invalid UTF-8 native backup JSON."); }
  if (!record(value) || value.version !== 1 || !Array.isArray(value.blockOrder)
    || value.blockOrder.length !== 1 || typeof value.blockOrder[0] !== "string"
    || !record(value.blocks) || Object.keys(value.blocks).length !== 1) {
    throw new Error("Select a single-spreadsheet .workspace.json backup.");
  }
  const id = value.blockOrder[0], block = value.blocks[id];
  if (!record(block) || block.type !== "table" || block.id !== id || !record(block.data)) {
    throw new Error("Native backup must contain exactly one table block.");
  }
  const source = block.data as unknown as TableBlockPayload;
  if (!Array.isArray(source.cells) || (source.mode !== "spreadsheet" && !Array.isArray(source.sheets))
    || (source.sheets !== undefined && !Array.isArray(source.sheets))) {
    throw new Error("Native backup does not contain a spreadsheet.");
  }
  const { sheets: _sheets, activeSheetId: _active, ...flat } = source;
  const stored: TableWorkbookSheet[] = source.sheets?.length
    ? source.sheets : [{ id, name: "Sheet1", data: flat }];
  const activeSheetId = stored.some((sheet) => sheet?.id === source.activeSheetId)
    ? source.activeSheetId! : stored[0]?.id;
  const sheets = stored.map((sheet) => ({
    ...sheet, data: sheet.id === activeSheetId ? flat : sheet.data,
  }));
  for (const sheet of sheets) {
    if (!sheet || typeof sheet.id !== "string" || typeof sheet.name !== "string"
      || !record(sheet.data) || !Array.isArray(sheet.data.cells)) {
      throw new Error("Invalid worksheet structure in native backup.");
    }
  }
  assertWorkbook(sheets);
  return {
    sheets, activeSheetId,
    warnings: ["Only spreadsheet data is restored. The current Office file name, board/block identity and external assets are unchanged."],
  };
}
