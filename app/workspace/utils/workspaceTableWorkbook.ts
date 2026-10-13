import type { Sheet } from "@fortune-sheet/core";
import type { CanvasBlock } from "../types/block";
import type { TableBlockPayload, TableWorkbookSheet } from "../types/table";
import { fortuneSheetToTablePatch, tableBlockToFortuneSheet, type TableSheetOptions } from "./workspaceSpreadsheetData";

export function tableSheetData(data: TableBlockPayload): TableWorkbookSheet["data"] {
  const { sheets: _sheets, activeSheetId: _activeSheetId, ...sheetData } = data;
  return sheetData;
}

export function getTableWorkbookSheets(block: CanvasBlock<"table">): TableWorkbookSheet[] {
  const saved = block.data.sheets;
  if (!saved?.length) return [{ id: block.id, name: "Sheet1", data: tableSheetData(block.data) }];
  const activeId = saved.some((sheet) => sheet.id === block.data.activeSheetId) ? block.data.activeSheetId : saved[0].id;
  return saved.map((sheet) => ({ ...sheet, data: sheet.id === activeId ? tableSheetData(block.data) : tableSheetData(sheet.data) }));
}

export function tableBlockToFortuneWorkbook(block: CanvasBlock<"table">, options: TableSheetOptions = {}): Sheet[] {
  const sheets = getTableWorkbookSheets(block);
  const activeId = sheets.some((sheet) => sheet.id === block.data.activeSheetId) ? block.data.activeSheetId : sheets[0].id;
  return sheets.map((sheet, order) => ({
    ...tableBlockToFortuneSheet({ ...block, id: sheet.id, data: sheet.data }, options),
    name: sheet.name, order, status: sheet.id === activeId ? 1 : 0,
  }));
}

export function fortuneWorkbookToTablePatch(workbook: Sheet[], block: CanvasBlock<"table">, activeSheetId?: string): Partial<TableBlockPayload> | null {
  if (!workbook.length) return null;
  const previous = new Map(getTableWorkbookSheets(block).map((sheet) => [sheet.id, sheet]));
  const sheets = workbook.map((sheet, index): TableWorkbookSheet => {
    const id = String(sheet.id ?? `${block.id}-${index}`);
    const before = previous.get(id)?.data ?? { rows: 1, cols: 1, cells: [[""]], mode: "spreadsheet" as const };
    return { id, name: sheet.name || `Sheet${index + 1}`, data: tableSheetData({ ...before, ...fortuneSheetToTablePatch(sheet, before) }) };
  });
  const activeId = String(activeSheetId ?? workbook.find((sheet) => sheet.status === 1)?.id ?? block.data.activeSheetId ?? sheets[0].id);
  const active = sheets.find((sheet) => sheet.id === activeId) ?? sheets[0];
  return { ...active.data, sheets, activeSheetId: active.id };
}
