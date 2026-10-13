import { shiftFormulaRefs } from "./tableFormulaReferences";
export { shiftFormulaRefs } from "./tableFormulaReferences";
import type { JsonMap } from "./operationsTables";
import { shiftSheetStructures } from "@/app/workspace/utils/workspaceSpreadsheetStructureShift";

// Per-cell grids kept beside `cells`; each is rows x cols and must move with it.
export const GRID_FIELDS = ["formulas", "cellValues", "cellFormats", "cellContents", "cellFontSizes", "cellAlign", "cellBgColor", "cellTextColor"] as const;

const isRecord = (value: unknown): value is JsonMap => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function mapGrids(data: JsonMap, transform: (rows: unknown[]) => unknown[]): void {
  for (const field of GRID_FIELDS) {
    if (Array.isArray(data[field])) data[field] = transform(data[field] as unknown[]);
  }
}

function spliceList(data: JsonMap, field: string, at: number, remove: number, insert: unknown[]): void {
  if (!Array.isArray(data[field])) return;
  const list = [...(data[field] as unknown[])];
  while (list.length < at) list.push(null);
  list.splice(at, remove, ...insert);
  data[field] = list;
}

function shiftIndexKeys(source: unknown, at: number, mode: "insert" | "delete"): JsonMap | undefined {
  if (!isRecord(source)) return undefined;
  const next: JsonMap = {};
  for (const [key, value] of Object.entries(source)) {
    const index = Number(key);
    if (!Number.isInteger(index)) { next[key] = value; continue; }
    if (mode === "insert") next[String(index >= at ? index + 1 : index)] = value;
    else if (index !== at) next[String(index > at ? index - 1 : index)] = value;
  }
  return next;
}

function remapCellItemKeys(data: JsonMap, axis: "row" | "col", at: number, mode: "insert" | "delete"): void {
  if (!isRecord(data.cellItems)) return;
  const next: JsonMap = {};
  for (const [key, attachments] of Object.entries(data.cellItems)) {
    const [row, col] = key.split(":").map(Number);
    if (!Number.isInteger(row) || !Number.isInteger(col)) continue;
    let index = axis === "row" ? row : col;
    if (mode === "insert") { if (index >= at) index += 1; }
    else if (index === at) continue;
    else if (index > at) index -= 1;
    next[axis === "row" ? `${index}:${col}` : `${row}:${index}`] = attachments;
  }
  data.cellItems = next;
}

function shiftMerges(data: JsonMap, axis: "row" | "col", at: number, mode: "insert" | "delete"): void {
  if (!Array.isArray(data.merges)) return;
  const span = axis === "row" ? "rowSpan" : "colSpan";
  data.merges = (data.merges as Array<Record<string, number>>).flatMap((merge) => {
    const start = merge[axis];
    const length = merge[span] ?? 1;
    if (mode === "insert") {
      if (at <= start) return [{ ...merge, [axis]: start + 1 }];
      return [at < start + length ? { ...merge, [span]: length + 1 } : merge];
    }
    if (at < start) return [{ ...merge, [axis]: start - 1 }];
    if (at >= start + length) return [merge];
    return length > 1 ? [{ ...merge, [span]: length - 1 }] : [];
  });
}

function rewriteFormulas(data: JsonMap, axis: "row" | "col", at: number, mode: "insert" | "delete", sheetName?: string): void {
  if (!Array.isArray(data.formulas)) return;
  data.formulas = (data.formulas as unknown[]).map((row) => (Array.isArray(row)
    ? row.map((formula) => (typeof formula === "string" && formula.startsWith("=") ? shiftFormulaRefs(formula, axis, at, mode, sheetName, sheetName) : formula))
    : row));
}

/** Inserts or deletes one row/column in every grid and list that is indexed by
 * it, so formulas, colours, formats and weights stay attached to their cells. */
export function shiftTableAxis(data: JsonMap, axis: "row" | "col", at: number, mode: "insert" | "delete", insertedWeight?: number, sheetName?: string): void {
  if (axis === "row") {
    mapGrids(data, (rows) => {
      const next = [...rows];
      while (next.length < at) next.push([]);
      if (mode === "insert") next.splice(at, 0, []); else next.splice(at, 1);
      return next;
    });
    spliceList(data, "rowHeights", at, mode === "insert" ? 0 : 1, mode === "insert" ? [28] : []);
    spliceList(data, "rowWeights", at, mode === "insert" ? 0 : 1, mode === "insert" ? [insertedWeight ?? 40] : []);
  } else {
    mapGrids(data, (rows) => rows.map((row) => {
      if (!Array.isArray(row)) return row;
      const next = [...row];
      while (next.length < at) next.push(null);
      if (mode === "insert") next.splice(at, 0, null); else next.splice(at, 1);
      return next;
    }));
    spliceList(data, "columnWidths", at, mode === "insert" ? 0 : 1, mode === "insert" ? [110] : []);
    spliceList(data, "colWeights", at, mode === "insert" ? 0 : 1, mode === "insert" ? [insertedWeight ?? 96] : []);
    spliceList(data, "columnFormats", at, mode === "insert" ? 0 : 1, mode === "insert" ? [null] : []);
    spliceList(data, "columnTypes", at, mode === "insert" ? 0 : 1, mode === "insert" ? [null] : []);
    const options = shiftIndexKeys(data.columnSelectOptions, at, mode);
    if (options) data.columnSelectOptions = options;
    for (const key of ["sortCol", "filterCol"] as const) {
      const spec = data[key];
      if (!isRecord(spec) || typeof spec.col !== "number") continue;
      if (mode === "delete" && spec.col === at) data[key] = null;
      else if (spec.col >= at) data[key] = { ...spec, col: spec.col + (mode === "insert" ? 1 : -1) };
    }
  }
  shiftMerges(data, axis, at, mode);
  remapCellItemKeys(data, axis, at, mode);
  rewriteFormulas(data, axis, at, mode, sheetName);
  shiftSheetStructures(data, axis, at, mode);
}

/** Keeps the raw spreadsheet value in step with an edited display cell. */
export function syncCellValues(data: JsonMap, updates: Array<{ row: number; column: number; text: string }>): void {
  if (!Array.isArray(data.cellValues)) return;
  const grid = (data.cellValues as unknown[]).map((row) => (Array.isArray(row) ? [...row] : []));
  for (const { row, column, text } of updates) {
    while (grid.length <= row) grid.push([]);
    const numeric = /^-?\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : undefined;
    grid[row][column] = text === "" ? null : numeric ?? text;
  }
  data.cellValues = grid;
}
