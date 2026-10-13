import { getTableWorkbookSheets } from "@/app/workspace/utils/workspaceTableWorkbook";
import type { CanvasBlock } from "@/app/workspace/types/block";
import { textTableCellContent } from "@/app/workspace/components/table/tableCellContent";
import { applyTableAutoFit } from "./tableAutoFitOperations";
import { parseTableFormatRange, positionsInRange, type TableRange } from "./tableFormatRange";
import { normalizeTable, type JsonMap } from "./operationsTables";
import { syncCellValues } from "./tableGridShift";
import { applyConditionalFormat } from "./tableSheetRules";
import { applyActionToTableSheet } from "./tableWorkbookOperations";
import { resolveId, type AgentBoardState } from "./operationsCore";
import { withTableCellMarks } from "./tableCellMarks";
import { addNote, isFormula } from "./tableOpsShared";

export const SHEET_STRUCTURE_COMMANDS = [
  "freeze_table_panes", "hide_table_rows", "hide_table_columns", "set_table_validation", "add_table_conditional_format",
  "set_table_filter", "set_table_link", "set_table_note", "set_table_sheet_options",
];

const record = (value: unknown): JsonMap => (value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {});
const field = (raw: JsonMap, key: string): unknown => raw[key] ?? record(raw.params)[key];
const isIndex = (value: unknown, limit: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < limit;
const LINK_URL = /^(https?:\/\/|mailto:)[^\s]+$/i;
const MAX_VALIDATION_CELLS = 5000;

function withKeyed(data: JsonMap, key: string, position: string, value: unknown): void {
  const next = { ...record(data[key]) };
  if (value === undefined) delete next[position]; else next[position] = value;
  if (Object.keys(next).length) data[key] = next; else delete data[key];
}

function parseRange(raw: JsonMap, data: JsonMap): TableRange | null {
  return parseTableFormatRange(field(raw, "range"), Number(data.rows), Number(data.cols));
}

function freezePanes(raw: JsonMap, data: JsonMap): boolean {
  const rows = Number(field(raw, "rows") ?? 0);
  const columns = Number(field(raw, "columns") ?? field(raw, "cols") ?? 0);
  if (![rows, columns].every((count) => Number.isInteger(count) && count >= 0) || rows > Number(data.rows) || columns > Number(data.cols)) return false;
  if (!rows && !columns) delete data.frozen;
  else data.frozen = { type: rows && columns ? "rangeBoth" : rows ? "rangeRow" : "rangeColumn", ...(rows ? { row: rows - 1 } : {}), ...(columns ? { col: columns - 1 } : {}) };
  return true;
}

function hideLines(raw: JsonMap, data: JsonMap, axis: "row" | "column"): boolean {
  const limit = Number(axis === "row" ? data.rows : data.cols);
  const hidden = field(raw, "hidden") !== false;
  const range = field(raw, "range");
  const indices = field(raw, "indices");
  let wanted: number[] = [];
  if (Array.isArray(indices)) {
    if (indices.length > limit) return false;
    wanted = indices as number[];
  } else if (Array.isArray(range) && range.length === 2) {
    const [low, high] = range as unknown[];
    if (!isIndex(low, limit) || !isIndex(high, limit) || low > high) return false;
    wanted = Array.from({ length: high - low + 1 }, (_, i) => low + i);
  } else if (range !== undefined) {
    const parsed = parseTableFormatRange(range, Number(data.rows), Number(data.cols));
    const span = parsed?.[axis];
    if (span) wanted = Array.from({ length: span[1] - span[0] + 1 }, (_, i) => span[0] + i);
  }
  if (!wanted.length || !wanted.every((index) => isIndex(index, limit))) return false;
  const key = axis === "row" ? "hiddenRows" : "hiddenCols";
  const current = new Set(Array.isArray(data[key]) ? data[key] as number[] : []);
  for (const index of wanted) { if (hidden) current.add(index); else current.delete(index); }
  if (current.size) data[key] = [...current].sort((a, b) => a - b); else delete data[key];
  return true;
}

function setValidation(raw: JsonMap, data: JsonMap): boolean {
  const range = parseRange(raw, data);
  if (!range) return false;
  const positions = positionsInRange(range);
  if (positions.length > MAX_VALIDATION_CELLS) return false;
  if (field(raw, "clear") === true) {
    for (const { row, column } of positions) withKeyed(data, "dataValidations", `${row}_${column}`, undefined);
    return true;
  }
  const values = field(raw, "values");
  const type = record(raw.params).type ?? record(raw.params).validationType ?? "dropdown";
  if (type !== "dropdown" || !Array.isArray(values) || !values.length || values.length > 100) return false;
  const items = values.map((item) => String(item ?? "").trim());
  if (items.some((item) => !item || item.includes(","))) return false;
  const rule = { type: "dropdown", type2: null, value1: items.join(","), value2: "", validity: "", remote: false, prohibitInput: false, hintShow: false, hintValue: "" };
  for (const { row, column } of positions) withKeyed(data, "dataValidations", `${row}_${column}`, rule);
  return true;
}

function setFilter(raw: JsonMap, data: JsonMap): boolean {
  if (field(raw, "clear") === true) { delete data.autoFilter; return true; }
  const range = parseRange(raw, data);
  if (!range) return false;
  const column = field(raw, "column");
  if (column !== undefined && (!isIndex(column, Number(data.cols)) || column < range.column[0] || column > range.column[1])) return false;
  const criteria = field(raw, "criteria");
  data.autoFilter = { range, ...(column !== undefined || criteria !== undefined ? { criteria: { ...(column !== undefined ? { column } : {}), ...record(criteria) } } : {}) };
  return true;
}

function setCellText(data: JsonMap, row: number, column: number, text: string): void {
  (data.cells as string[][])[row][column] = text;
  syncCellValues(data, [{ row, column, text }]);
  if (Array.isArray(data.formulas) && Array.isArray(data.formulas[row])) (data.formulas[row] as unknown[])[column] = null;
  if (Array.isArray(data.cellContents)) {
    const contents = data.cellContents as unknown[][];
    contents[row] = Array.isArray(contents[row]) ? contents[row] : [];
    contents[row][column] = textTableCellContent(text);
  }
}

function setLink(raw: JsonMap, data: JsonMap): boolean {
  const row = Number(field(raw, "row"));
  const column = Number(field(raw, "column"));
  if (!isIndex(row, Number(data.rows)) || !isIndex(column, Number(data.cols))) return false;
  const position = `${row}_${column}`;
  if (field(raw, "clear") === true) { withKeyed(data, "cellLinks", position, undefined); return true; }
  const url = field(raw, "url");
  const label = field(raw, "label");
  if (typeof url !== "string" || url.length > 2048 || !LINK_URL.test(url.trim())) return false;
  const formulas = Array.isArray(data.formulas) && Array.isArray(data.formulas[row]) ? (data.formulas[row] as unknown[])[column] : null;
  if (isFormula(formulas) && !(typeof label === "string" && label.trim())) {
    addNote(raw, `Refused: cell ${row}_${column} holds a formula and a link would replace it. Pass a label to overwrite it, or link a different cell.`);
    return false;
  }
  const text = typeof label === "string" && label.trim() ? label.trim() : (data.cells as string[][])[row][column] || url.trim();
  setCellText(data, row, column, text);
  withKeyed(data, "cellLinks", position, { linkType: "webpage", linkAddress: url.trim() });
  const colors = Array.isArray(data.cellTextColor) ? data.cellTextColor as unknown[][] : [];
  colors[row] = Array.isArray(colors[row]) ? colors[row] : [];
  colors[row][column] = "rgb(0, 0, 255)";
  data.cellTextColor = colors;
  const contents = Array.isArray(data.cellContents) ? data.cellContents as unknown[][] : [];
  contents[row] = Array.isArray(contents[row]) ? contents[row] : [];
  contents[row][column] = withTableCellMarks(contents[row][column], text, { underline: true });
  data.cellContents = contents;
  return true;
}

function setNote(raw: JsonMap, data: JsonMap): boolean {
  const row = Number(field(raw, "row"));
  const column = Number(field(raw, "column"));
  if (!isIndex(row, Number(data.rows)) || !isIndex(column, Number(data.cols))) return false;
  const position = `${row}_${column}`;
  if (field(raw, "clear") === true) { withKeyed(data, "cellNotes", position, undefined); return true; }
  const text = field(raw, "text");
  if (typeof text !== "string" || !text.trim() || text.length > 5000) return false;
  withKeyed(data, "cellNotes", position, { value: text, isShow: false, left: null, top: null, width: null, height: null });
  return true;
}

function setSheetOptions(raw: JsonMap, data: JsonMap): boolean {
  const color = field(raw, "color");
  const hidden = field(raw, "hidden");
  if (color === undefined && hidden === undefined) return false;
  if (color !== undefined) {
    if (color === null || color === "") delete data.sheetColor;
    else if (typeof color === "string" && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(color.trim())) data.sheetColor = color.trim();
    else return false;
  }
  if (hidden !== undefined) {
    if (typeof hidden !== "boolean") return false;
    if (hidden) data.sheetHidden = true; else delete data.sheetHidden;
  }
  return true;
}

function applyStructure(raw: JsonMap, block: JsonMap, type: string): boolean {
  const data = normalizeTable(record(block.data));
  const wasDocument = data.mode !== "spreadsheet";
  const handlers: Record<string, () => boolean> = {
    freeze_table_panes: () => freezePanes(raw, data),
    hide_table_rows: () => hideLines(raw, data, "row"),
    hide_table_columns: () => hideLines(raw, data, "column"),
    set_table_validation: () => setValidation(raw, data),
    add_table_conditional_format: () => applyConditionalFormat(raw, data, parseRange(raw, data)),
    set_table_filter: () => setFilter(raw, data),
    set_table_link: () => setLink(raw, data),
    set_table_note: () => setNote(raw, data),
    set_table_sheet_options: () => setSheetOptions(raw, data),
  };
  if (!handlers[type]?.()) return false;
  data.mode = "spreadsheet";
  if (wasDocument) addNote(raw, "The table was switched from document mode to spreadsheet mode so the spreadsheet feature works; use update_table_options to switch back.");
  block.data = applyTableAutoFit(block, data);
  block.updatedAt = Date.now();
  return true;
}

/** Applies a spreadsheet structure command to the targeted (active or named) sheet of a table block. */
export function applySheetStructureCommand(state: AgentBoardState, raw: JsonMap, type: string): { ids: string[]; operation: string; notes?: string[] } {
  const notes: string[] = [];
  const tagged: JsonMap = { ...raw, __notes: notes };
  const result = (ids: string[]) => ({ ids, operation: type, ...(notes.length ? { notes } : {}) });
  const resolved = resolveId(raw, state);
  const tableIds = Object.values(state.blocks).filter((block) => block.type === "table").map((block) => String(block.id));
  const targetId = resolved ?? (tableIds.length === 1 ? tableIds[0] : undefined);
  const block = targetId ? state.blocks[targetId] : undefined;
  if (block?.type !== "table") return result([]);
  const before = type === "set_table_sheet_options" ? structuredClone(block) : undefined;
  if (!applyActionToTableSheet(tagged, block, (action, target) => applyStructure(action, target, type))) return result([]);
  if (before) {
    // A hidden sheet must never be the active one, and at least one sheet must stay visible.
    const sheets = getTableWorkbookSheets(block as unknown as CanvasBlock<"table">);
    if (sheets.every((sheet) => sheet.data.sheetHidden) || (block.data as JsonMap).sheetHidden) {
      Object.assign(block, before);
      return result([]);
    }
  }
  return result([targetId!]);
}
