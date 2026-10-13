import { evaluateTableFormulas } from "@/app/workspace/utils/tableFormula";
import type { TableBlockPayload } from "@/app/workspace/types/table";
import { GRID_FIELDS } from "./tableGridShift";
import { shiftRelativeRefs } from "./tableFormulaReferences";
import { parseTableFormatRange } from "./tableFormatRange";
import { remapSheetStructures } from "./tableAxisRemap";
import { addNote, field, formulaOptions, intField, isFormula, rec } from "./tableOpsShared";
import type { JsonMap } from "./operationsTables";

type Merge = { row: number; col: number; rowSpan: number; colSpan: number };

function sortKey(text: string, type: unknown, labels: Map<string, string>): { blank: boolean; number?: number; text: string } {
  const raw = labels.get(text) ?? text;
  if (!raw.trim()) return { blank: true, text: "" };
  const numeric = Number(raw.replace(/[,\s$€£%]/g, ""));
  if (type === "number" || (type !== "date" && type !== "select" && type !== "person" && Number.isFinite(numeric) && raw.trim() !== "")) {
    return { blank: false, number: Number.isFinite(numeric) ? numeric : Number.NEGATIVE_INFINITY, text: raw };
  }
  if (type === "date") {
    const time = Date.parse(raw);
    return { blank: false, number: Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY, text: raw };
  }
  return { blank: false, text: raw };
}

/** Real data sort: whole rows of the range are physically reordered in every
 * per-cell grid. Formulas move with their row (relative references shift like
 * a copy); references from cells outside the range are NOT rewritten. */
export function sortTableRange(raw: JsonMap, data: JsonMap): boolean {
  const rows = Number(data.rows);
  const cols = Number(data.cols);
  const rangeInput = field(raw, "range");
  const range = rangeInput === undefined ? { row: [0, rows - 1] as [number, number], column: [0, cols - 1] as [number, number] } : parseTableFormatRange(rangeInput, rows, cols);
  const column = intField(raw, "column") ?? intField(raw, "col");
  const direction = String(field(raw, "direction") ?? field(raw, "dir") ?? "asc").toLowerCase();
  if (!range || column === undefined || column < range.column[0] || column > range.column[1] || !["asc", "desc"].includes(direction)) return false;
  const hasHeader = typeof field(raw, "hasHeader") === "boolean" ? field(raw, "hasHeader") as boolean : range.row[0] === 0 && Boolean(data.headerRow);
  const first = range.row[0] + (hasHeader ? 1 : 0);
  const last = range.row[1];
  if (last - first < 1) return false;
  const merges = (Array.isArray(data.merges) ? data.merges : []) as Merge[];
  if (merges.some((merge) => merge.row <= last && merge.row + merge.rowSpan > first && merge.col <= range.column[1] && merge.col + merge.colSpan > range.column[0])) {
    addNote(raw, "Refused: the sort range intersects merged cells. Unmerge them first (update_table_cell_format {merge:false}).");
    return false;
  }
  const evaluated = data.mode === "spreadsheet" && Array.isArray(data.formulas)
    ? evaluateTableFormulas(data as Partial<TableBlockPayload>, formulaOptions(raw, data)).values : (data.cells as string[][]);
  const type = Array.isArray(data.columnTypes) ? data.columnTypes[column] : undefined;
  const options = Array.isArray(rec(data.columnSelectOptions)[column]) ? rec(data.columnSelectOptions)[column] as JsonMap[] : [];
  const labels = new Map(options.map((option) => [String(option.id), String(option.label ?? option.id)]));
  const sign = direction === "desc" ? -1 : 1;
  const keyed = Array.from({ length: last - first + 1 }, (_, index) => ({ index: first + index, key: sortKey(String(evaluated[first + index]?.[column] ?? ""), type, labels) }));
  keyed.sort((a, b) => {
    if (a.key.blank || b.key.blank) return a.key.blank === b.key.blank ? a.index - b.index : a.key.blank ? 1 : -1;
    const diff = a.key.number !== undefined && b.key.number !== undefined ? a.key.number - b.key.number
      : a.key.text.localeCompare(b.key.text, undefined, { numeric: true, sensitivity: "base" });
    return diff === 0 ? a.index - b.index : sign * diff;
  });
  const order = keyed.map((item) => item.index);
  if (order.every((old, offset) => old === first + offset)) return true;
  const fullWidth = range.column[0] === 0 && range.column[1] === cols - 1;
  const [c0, c1] = range.column;
  for (const key of ["cells", ...GRID_FIELDS.filter((name) => Array.isArray(data[name]))]) {
    const grid = data[key] as unknown[][];
    const source = grid.map((row) => (Array.isArray(row) ? [...row] : []));
    order.forEach((old, offset) => {
      const target = first + offset;
      if (!Array.isArray(grid[target])) grid[target] = [];
      for (let col = c0; col <= c1; col += 1) {
        const item = source[old]?.[col];
        grid[target][col] = key === "formulas" && isFormula(item) ? shiftRelativeRefs(item, target - old, 0) : item === undefined ? (key === "cells" ? "" : null) : item;
      }
    });
  }
  if (fullWidth) {
    for (const key of ["rowHeights", "rowWeights"]) {
      if (!Array.isArray(data[key])) continue;
      const list = [...data[key] as unknown[]];
      order.forEach((old, offset) => { list[first + offset] = (data[key] as unknown[])[old] ?? null; });
      data[key] = list;
    }
  }
  if (data.cellItems && typeof data.cellItems === "object") {
    const where = new Map(order.map((old, offset) => [old, first + offset]));
    const next: JsonMap = {};
    for (const [key, items] of Object.entries(data.cellItems as JsonMap)) {
      const [row, col] = key.split(":").map(Number);
      next[where.has(row) && col >= c0 && col <= c1 ? `${where.get(row)}:${col}` : key] = items;
    }
    data.cellItems = next;
  }
  const moved = new Map(order.map((old, offset) => [old, first + offset]));
  const structureNotes = remapSheetStructures(data, "row", {
    map: (index) => moved.get(index) ?? index,
    cellApplies: (row, col) => moved.has(row) && col >= c0 && col <= c1,
    wholeLines: fullWidth,
  });
  for (const note of structureNotes) addNote(raw, note);
  if (data.sortCol) addNote(raw, "A view sort (sortCol) is still active and re-orders the display on top of this data sort. Call update_table_column with sortDirection \"none\" to clear it.");
  return true;
}
