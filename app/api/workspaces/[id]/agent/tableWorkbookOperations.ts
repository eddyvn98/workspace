import { getTableWorkbookSheets, tableSheetData } from "@/app/workspace/utils/workspaceTableWorkbook";
import type { CanvasBlock } from "@/app/workspace/types/block";
import type { TableWorkbookSheet } from "@/app/workspace/types/table";
import { renameFormulaSheet, shiftFormulaRefs } from "./tableFormulaReferences";
import { normalizeTable, type JsonMap } from "./operationsTables";

export const TABLE_SHEET_COMMANDS = ["add_table_sheet", "rename_table_sheet", "duplicate_table_sheet", "delete_table_sheet", "reorder_table_sheets", "select_table_sheet"];

function field(raw: JsonMap, key: string): unknown {
  const params = raw.params && typeof raw.params === "object" ? raw.params as JsonMap : {};
  return raw[key] ?? params[key];
}

function matchingSheet(sheets: TableWorkbookSheet[], raw: JsonMap, activeId: string) {
  const id = field(raw, "sheetId");
  if (typeof id === "string") return sheets.find((sheet) => sheet.id === id);
  const name = field(raw, "sheetName");
  const matched = sheets.filter((sheet) => typeof name === "string" && sheet.name.toLowerCase() === name.toLowerCase());
  return name !== undefined ? matched.length === 1 ? matched[0] : undefined : sheets.find((sheet) => sheet.id === activeId);
}

function saveWorkbook(block: JsonMap, sheets: TableWorkbookSheet[], activeId: string) {
  const active = sheets.find((sheet) => sheet.id === activeId) ?? sheets[0];
  block.data = { ...active.data, sheets, activeSheetId: active.id };
  block.updatedAt = Date.now();
}

function rewriteWorkbookFormulas(sheets: TableWorkbookSheet[], rewrite: (formula: string, sheetName: string) => string) {
  for (const sheet of sheets) {
    if (sheet.data.formulas) sheet.data = { ...sheet.data, formulas: sheet.data.formulas.map((row) => row.map((formula) => typeof formula === "string" ? rewrite(formula, sheet.name) : formula)) };
  }
}

function validName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 && name.trim().length <= 31 && !/[\[\]*?:/\\]/.test(name) && !/^'|'$/.test(name.trim());
}

export function applyTableSheetAction(raw: JsonMap, block: JsonMap, type: string): boolean {
  const sheets = getTableWorkbookSheets(block as unknown as CanvasBlock<"table">);
  const requestedId = (block.data as JsonMap).activeSheetId;
  const activeId = sheets.some((sheet) => sheet.id === requestedId) ? String(requestedId) : sheets[0].id;
  const selected = matchingSheet(sheets, raw, activeId);
  const name = field(raw, "name");
  if (type === "add_table_sheet" || type === "duplicate_table_sheet") {
    if (!validName(name) || sheets.some((sheet) => sheet.name.toLowerCase() === name.trim().toLowerCase())) return false;
    if (type === "duplicate_table_sheet" && !selected) return false;
    const input = field(raw, "data");
    const draft = input && typeof input === "object" && !Array.isArray(input) ? input as JsonMap : {};
    const data = type === "duplicate_table_sheet" ? structuredClone(selected!.data)
      : tableSheetData(normalizeTable({ ...draft, mode: "spreadsheet" }) as unknown as CanvasBlock<"table">["data"]);
    const created = { id: crypto.randomUUID(), name: name.trim(), data };
    sheets.push(created);
    saveWorkbook(block, sheets, field(raw, "activate") === false ? activeId : created.id);
    return true;
  }
  if (type === "reorder_table_sheets") {
    const ids = field(raw, "sheetIds");
    if (!Array.isArray(ids) || ids.length !== sheets.length || new Set(ids).size !== sheets.length || ids.some((id) => !sheets.some((sheet) => sheet.id === id))) return false;
    saveWorkbook(block, ids.map((id) => sheets.find((sheet) => sheet.id === id)!), activeId);
    return true;
  }
  if (!selected) return false;
  if (type === "rename_table_sheet") {
    if (!validName(name) || sheets.some((sheet) => sheet.id !== selected.id && sheet.name.toLowerCase() === name.trim().toLowerCase())) return false;
    rewriteWorkbookFormulas(sheets, (formula) => renameFormulaSheet(formula, selected.name, name.trim()));
    selected.name = name.trim();
  } else if (type === "delete_table_sheet") {
    if (sheets.length < 2) return false;
    rewriteWorkbookFormulas(sheets, (formula) => renameFormulaSheet(formula, selected.name));
    sheets.splice(sheets.indexOf(selected), 1);
  } else if (type !== "select_table_sheet") return false;
  saveWorkbook(block, sheets, type === "select_table_sheet" ? selected.id : activeId);
  return true;
}

export function applyActionToTableSheet(raw: JsonMap, block: JsonMap, action: (raw: JsonMap, block: JsonMap) => boolean): boolean {
  const typed = block as unknown as CanvasBlock<"table">;
  const sheets = getTableWorkbookSheets(typed);
  const activeId = sheets.some((sheet) => sheet.id === typed.data.activeSheetId) ? typed.data.activeSheetId! : sheets[0].id;
  const selected = matchingSheet(sheets, raw, activeId);
  if (!selected) return false;
  const beforeSize = { rows: selected.data.rows, cols: selected.data.cols };
  const proxy: JsonMap = { ...block, data: selected.data };
  // Structural actions (move/duplicate) register how other sheets' references must follow.
  const rewrite: { fn?: (formula: string, formulaSheet: string, targetSheet: string) => string } = {};
  if (!action({ ...raw, __formulaSheetName: selected.name, __sheets: sheets, __rewrite: rewrite }, proxy)) return false;
  selected.data = tableSheetData(proxy.data as unknown as CanvasBlock<"table">["data"]);
  const type = String(raw.type);
  if (/^(insert|delete)_table_(row|column)$/.test(type)) {
    const mode = type.startsWith("insert") ? "insert" : "delete";
    const axis = type.endsWith("row") ? "row" : "col";
    const size = axis === "row" ? beforeSize.rows : beforeSize.cols;
    const requested = Number(field(raw, axis === "row" ? "row" : "column"));
    const at = Math.max(0, Math.min(mode === "insert" ? size : size - 1, Number.isInteger(requested) ? requested : mode === "insert" ? size : size - 1));
    rewriteWorkbookFormulas(sheets.filter((sheet) => sheet.id !== selected.id), (formula, name) => shiftFormulaRefs(formula, axis, at, mode, selected.name, name));
  }
  if (rewrite.fn) rewriteWorkbookFormulas(sheets.filter((sheet) => sheet.id !== selected.id), (formula, name) => rewrite.fn!(formula, name, selected.name));
  saveWorkbook(block, sheets, activeId);
  if (selected.id === activeId) block.transform = proxy.transform;
  return true;
}
