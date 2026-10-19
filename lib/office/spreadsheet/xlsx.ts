import ExcelJS from "exceljs";
import type { Cell, Worksheet } from "exceljs";
import type { TableBlockPayload, TableWorkbookSheet } from "@/app/workspace/types/table";
import { assertCellText, assertDimensions, assertFormula, assertWorkbook, safeLink, SHEET_LIMITS } from "./limits";
import { inspectXlsx } from "./zipSafety";
import { address, parseRange } from "./addresses";
import { colorFromExcel, colorToExcel, put, readStyle, writeStyle, type Warnings } from "./xlsxStyles";
import { readBorder, writeBorders } from "./xlsxBorders";
import { readConditional, readValidation, writeConditional, writeValidation } from "./xlsxRules";

export interface WorkbookImport { sheets: TableWorkbookSheet[]; activeSheetId: string; warnings: string[] }
const dateSerial = (date: Date) => date.valueOf() / 86_400_000 + 25569;
function readValue(cell: Cell, data: TableBlockPayload, r: number, c: number, warnings: Warnings): void {
  if (cell.isMerged && cell.master.address !== cell.address) return;
  const key = `${r}_${c}`;
  let value: unknown = cell.value;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("formula" in value || "sharedFormula" in value) {
      const formula = "=" + cell.formula; assertFormula(formula);
      data.formulas = put(data.formulas, r, c, formula);
      value = (value as { result?: unknown }).result ?? "";
    } else if ("richText" in value) {
      value = cell.text; warnings.add("Mixed formatting within a single cell is flattened to the cell style.");
    } else if ("hyperlink" in value) {
      const link = value as { hyperlink: string; text?: string };
      if (safeLink(link.hyperlink)) (data.cellLinks ??= {})[key] = { linkType: "webpage", linkAddress: link.hyperlink };
      else warnings.add("Unsafe or local-file hyperlinks were removed.");
      value = link.text ?? "";
    } else if ("error" in value) value = (value as { error: string }).error;
  }
  if (value instanceof Date) value = dateSerial(value);
  const raw = typeof value === "number" || typeof value === "boolean" || typeof value === "string" ? value : "";
  assertCellText(String(raw));
  data.cells[r][c] = String(raw);
  if (typeof raw !== "string") data.cellValues = put(data.cellValues, r, c, raw);
  // Quoted text stays text even when it begins with '='.
  if (typeof raw === "string" && /^[=+\-@]/.test(raw) && !data.formulas?.[r]?.[c]) data.cellFormats = put(data.cellFormats, r, c, { fa: "@", t: "s" });
  const note = cell.note;
  if (note) (data.cellNotes ??= {})[key] = { value: typeof note === "string" ? note : (note.texts ?? []).map((x) => x.text).join(""), isShow: false };
}
function readSheet(ws: Worksheet, warnings: Warnings): TableWorkbookSheet {
  const rows = Math.max(1, ws.rowCount), cols = Math.max(1, ws.columnCount);
  assertDimensions(rows, cols);
  const data: TableBlockPayload = { rows, cols, cells: Array.from({ length: rows }, () => Array(cols).fill("")), mode: "spreadsheet" };
  ws.eachRow({ includeEmpty: false }, (row, ri) => row.eachCell({ includeEmpty: false }, (cell, ci) => {
    const r = ri - 1, c = ci - 1;
    readValue(cell, data, r, c, warnings); readStyle(cell, data, r, c, warnings); readBorder(cell, data, r, c, warnings);
    readValidation(cell, data, `${r}_${c}`, warnings);
  }));
  data.rowHeights = Array.from({ length: rows }, (_, r) => (ws.getRow(r + 1).height ?? 21) * 4 / 3);
  data.columnWidths = Array.from({ length: cols }, (_, c) => Math.round((ws.getColumn(c + 1).width ?? 15) * 7 + 5));
  data.hiddenRows = Array.from({ length: rows }, (_, r) => r).filter((r) => ws.getRow(r + 1).hidden);
  data.hiddenCols = Array.from({ length: cols }, (_, c) => c).filter((c) => ws.getColumn(c + 1).hidden);
  data.merges = (ws.model.merges ?? []).map((ref) => {
    const range = parseRange(ref);
    return { row: range.row[0], col: range.column[0], rowSpan: range.row[1] - range.row[0] + 1, colSpan: range.column[1] - range.column[0] + 1 };
  });
  const frozen = (ws.views ?? []).find((v) => v.state === "frozen");
  if (frozen?.state === "frozen") {
    const row = frozen.ySplit ?? 0, col = frozen.xSplit ?? 0;
    if (row || col) data.frozen = { type: row && col ? "rangeBoth" : row ? "rangeRow" : "rangeColumn", ...(row ? { row: row - 1 } : {}), ...(col ? { col: col - 1 } : {}) };
  }
  if (typeof ws.autoFilter === "string") data.autoFilter = { range: parseRange(ws.autoFilter) };
  data.sheetColor = colorFromExcel(ws.properties.tabColor, warnings);
  if (ws.state !== "visible") data.sheetHidden = true;
  readConditional(ws, data, warnings);
  return { id: `xlsx-${ws.id}`, name: ws.name, data };
}
export async function importXlsx(bytes: Uint8Array): Promise<WorkbookImport> {
  const parts = await inspectXlsx(bytes), warnings: Warnings = new Set();
  if (parts.some((name) => /xl\/(drawings|charts|pivot|tables|slicer)/i.test(name))) warnings.add("Charts, drawings, pivot tables, Excel tables and slicers are not preserved; only supported cell data/styles are imported.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  if (workbook.worksheets.length > SHEET_LIMITS.sheets) throw new Error("More than 20 worksheets.");
  let total = 0;
  for (const ws of workbook.worksheets) {
    total += assertDimensions(Math.max(1, ws.rowCount), Math.max(1, ws.columnCount));
    if (total > SHEET_LIMITS.cells) throw new Error("Workbook exceeds 50,000 allocated cells.");
  }
  if (workbook.definedNames.model.length) warnings.add("Named ranges are not preserved; formulas using them need review.");
  const sheets = workbook.worksheets.map((ws) => readSheet(ws, warnings));
  assertWorkbook(sheets);
  warnings.add("Review formulas after import. Excel-only functions, print settings, protection and advanced workbook features are outside the supported contract.");
  const activeIndex = workbook.views?.[0]?.activeTab ?? 0;
  const active = sheets[activeIndex] && !sheets[activeIndex].data.sheetHidden ? sheets[activeIndex] : sheets.find((s) => !s.data.sheetHidden)!;
  return { sheets, activeSheetId: active.id, warnings: [...warnings] };
}
function writeSheet(ws: Worksheet, data: TableBlockPayload, warnings: Warnings): void {
  for (let r = 0; r < data.rows; r++) for (let c = 0; c < data.cols; c++) {
    const cell = ws.getCell(r + 1, c + 1), key = `${r}_${c}`;
    const value = data.cellValues?.[r]?.[c] ?? data.cells[r]?.[c] ?? "", formula = data.formulas?.[r]?.[c];
    if (formula) { assertFormula(formula); cell.value = { formula: formula.replace(/^=/, ""), result: value }; }
    else cell.value = value;
    const link = data.cellLinks?.[key];
    if (link && !formula) {
      if (safeLink(link.linkAddress)) cell.value = { text: String(value), hyperlink: link.linkAddress };
      else warnings.add("Unsafe or local-file hyperlinks were removed.");
    }
    if (data.cellNotes?.[key]) cell.note = data.cellNotes[key].value;
    writeStyle(cell, data, r, c, warnings); writeValidation(cell, data, key, warnings);
  }
  for (let r = 0; r < data.rows; r++) {
    const row = ws.getRow(r + 1); row.hidden = data.hiddenRows?.includes(r) ?? false;
    if (data.rowHeights?.[r]) row.height = data.rowHeights[r] * 3 / 4;
  }
  for (let c = 0; c < data.cols; c++) {
    const col = ws.getColumn(c + 1); col.hidden = data.hiddenCols?.includes(c) ?? false;
    if (data.columnWidths?.[c]) col.width = Math.max(1, (data.columnWidths[c] - 5) / 7);
  }
  for (const merge of data.merges ?? []) {
    if (![merge.row, merge.col, merge.rowSpan, merge.colSpan].every(Number.isSafeInteger) || merge.row < 0 || merge.col < 0
      || merge.rowSpan < 1 || merge.colSpan < 1 || merge.row + merge.rowSpan > data.rows || merge.col + merge.colSpan > data.cols) throw new Error("Invalid merged range.");
    ws.mergeCells(`${address(merge.row, merge.col)}:${address(merge.row + merge.rowSpan - 1, merge.col + merge.colSpan - 1)}`);
  }
  const freeze = data.frozen;
  if (freeze) {
    const ySplit = ["rangeRow", "rangeBoth"].includes(freeze.type) ? (freeze.row ?? 0) + 1 : 0;
    const xSplit = ["rangeColumn", "rangeBoth"].includes(freeze.type) ? (freeze.col ?? 0) + 1 : 0;
    if (xSplit || ySplit) ws.views = [{ state: "frozen", xSplit, ySplit }];
  }
  if (data.autoFilter) {
    const range = data.autoFilter.range;
    ws.autoFilter = `${address(range.row[0], range.column[0])}:${address(range.row[1], range.column[1])}`;
    if (data.autoFilter.filters || data.autoFilter.criteria) warnings.add("Filter ranges are exported; active filter criteria must be reapplied in Excel.");
  }
  if (data.cellItems && Object.keys(data.cellItems).length) warnings.add("Workspace cell attachments are not embedded in XLSX. Keep a native backup.");
  ws.properties.tabColor = colorToExcel(data.sheetColor, warnings) as ExcelJS.Color;
  ws.state = data.sheetHidden ? "hidden" : "visible";
  writeBorders(ws, data, warnings); writeConditional(ws, data, warnings);
}
export async function exportXlsx(sheets: TableWorkbookSheet[], activeSheetId: string): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  assertWorkbook(sheets);
  const warnings: Warnings = new Set(), workbook = new ExcelJS.Workbook();
  workbook.creator = "Workspace Office"; workbook.calcProperties.fullCalcOnLoad = true;
  workbook.views = [{ x: 0, y: 0, width: 1200, height: 800, visibility: "visible", activeTab: Math.max(0, sheets.findIndex((s) => s.id === activeSheetId)), firstSheet: 0 }];
  for (const sheet of sheets) writeSheet(workbook.addWorksheet(sheet.name), sheet.data, warnings);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  if (bytes.length > SHEET_LIMITS.fileBytes) throw new Error("Export exceeds the 10 MiB workbook limit.");
  return { bytes, warnings: [...warnings] };
}
