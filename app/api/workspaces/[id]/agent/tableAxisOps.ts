import { GRID_FIELDS, shiftTableAxis } from "./tableGridShift";
import { remapFormulaRefs, shiftRelativeRefs } from "./tableFormulaReferences";
import { addNote, intField, rec } from "./tableOpsShared";
import { remapSheetStructures } from "./tableAxisRemap";
import { duplicateStructuresIntoSlot } from "./tableAxisDuplicate";
import type { JsonMap } from "./operationsTables";

type Axis = "row" | "col";
type Merge = { row: number; col: number; rowSpan: number; colSpan: number };

const LISTS: Record<Axis, string[]> = {
  row: ["rowHeights", "rowWeights"],
  col: ["columnWidths", "colWeights", "columnFormats", "columnTypes"],
};

const clone = <T,>(item: T): T => (item === undefined || item === null ? item : structuredClone(item));
const label = (axis: Axis) => (axis === "row" ? "row" : "column");

/** Applies new[i] = old[order[i]] to every grid, list, setting and merge that is
 * indexed by the axis, then rewrites formula references to follow the data. */
export function permuteTableAxis(data: JsonMap, axis: Axis, order: number[], sheetName?: string, onRangeChange?: () => void): string[] {
  const inverse = new Map(order.map((old, next) => [old, next]));
  const reorderGrid = (grid: unknown[], fill: unknown): unknown[] => (axis === "row"
    ? order.map((old) => (Array.isArray(grid[old]) ? grid[old] : []))
    : grid.map((row) => (Array.isArray(row) ? order.map((old) => row[old] ?? fill) : row)));
  data.cells = reorderGrid(data.cells as unknown[], "");
  for (const key of GRID_FIELDS) if (Array.isArray(data[key])) data[key] = reorderGrid(data[key] as unknown[], null);
  for (const key of LISTS[axis]) {
    if (Array.isArray(data[key])) data[key] = order.map((old) => (data[key] as unknown[])[old] ?? null);
  }
  if (Array.isArray(data.formulas)) {
    data.formulas = (data.formulas as unknown[][]).map((row) => (Array.isArray(row) ? row.map((formula) => (
      typeof formula === "string" && formula.startsWith("=")
        ? remapFormulaRefs(formula, axis, (index) => inverse.get(index) ?? index, sheetName, sheetName, onRangeChange) : formula)) : row));
  }
  if (axis === "col") {
    const options = rec(data.columnSelectOptions);
    if (Object.keys(options).length) {
      data.columnSelectOptions = Object.fromEntries(Object.entries(options).map(([key, value]) => [String(inverse.get(Number(key)) ?? key), value]));
    }
    for (const key of ["sortCol", "filterCol"] as const) {
      const spec = data[key];
      if (spec && typeof spec === "object" && inverse.has(Number((spec as JsonMap).col))) data[key] = { ...(spec as JsonMap), col: inverse.get(Number((spec as JsonMap).col)) };
    }
  }
  if (Array.isArray(data.merges)) {
    data.merges = (data.merges as Merge[]).map((merge) => ({ ...merge, [axis]: inverse.get(merge[axis]) ?? merge[axis] }));
  }
  if (data.cellItems && typeof data.cellItems === "object") {
    const next: JsonMap = {};
    for (const [key, items] of Object.entries(data.cellItems as JsonMap)) {
      const [row, col] = key.split(":").map(Number);
      const moved = inverse.get(axis === "row" ? row : col) ?? (axis === "row" ? row : col);
      next[axis === "row" ? `${moved}:${col}` : `${row}:${moved}`] = items;
    }
    data.cellItems = next;
  }
  return remapSheetStructures(data, axis, { map: (index) => inverse.get(index) ?? index, wholeLines: true });
}

/** True when a merge spans the axis inside [low, high]; swapping would tear it. */
export function rangeTouchesSpanningMerge(data: JsonMap, axis: Axis, low: number, high: number): boolean {
  const span = axis === "row" ? "rowSpan" : "colSpan";
  return ((data.merges ?? []) as Merge[]).some((merge) => merge[span] > 1 && merge[axis] <= high && merge[axis] + merge[span] - 1 >= low);
}

export function moveTableAxis(raw: JsonMap, data: JsonMap, axis: Axis): boolean {
  const size = Number(axis === "row" ? data.rows : data.cols);
  const from = intField(raw, "from");
  const to = intField(raw, "to");
  if (from === undefined || to === undefined || from === to || from < 0 || to < 0 || from >= size || to >= size) return false;
  if (rangeTouchesSpanningMerge(data, axis, Math.min(from, to), Math.max(from, to))) {
    addNote(raw, `Refused: a merged range spans the ${label(axis)}s between ${from} and ${to}. Unmerge it with update_table_cell_format {merge:false} first.`);
    return false;
  }
  const order = Array.from({ length: size }, (_, index) => index);
  order.splice(to, 0, order.splice(from, 1)[0]);
  const sheetName = raw.__formulaSheetName as string | undefined;
  let noted = false;
  const noteRanges = () => {
    if (noted) return;
    noted = true;
    addNote(raw, `A formula range had to be widened or split because a ${label(axis)} moved out of it; review the affected formulas.`);
  };
  const notes = permuteTableAxis(data, axis, order, sheetName, noteRanges);
  for (const note of notes) addNote(raw, note);
  const inverse = new Map(order.map((old, next) => [old, next]));
  const holder = raw.__rewrite as { fn?: (formula: string, formulaSheet: string, targetSheet: string) => string } | undefined;
  if (holder) holder.fn = (formula, formulaSheet, targetSheet) => remapFormulaRefs(formula, axis, (index) => inverse.get(index) ?? index, targetSheet, formulaSheet, noteRanges);
  return true;
}

/** Copies the per-cell data of one row/column into the freshly inserted slot. */
function copyIntoSlot(data: JsonMap, axis: Axis, source: number, slot: number, delta: number): void {
  const rows = Number(data.rows);
  const cols = Number(data.cols);
  const grids = ["cells", ...GRID_FIELDS.filter((key) => Array.isArray(data[key]))];
  for (const key of grids) {
    const grid = data[key] as unknown[][];
    const copy = (item: unknown) => (key === "formulas" && typeof item === "string" && item.startsWith("=")
      ? shiftRelativeRefs(item, axis === "row" ? delta : 0, axis === "col" ? delta : 0) : clone(item));
    if (axis === "row") {
      const original = Array.isArray(grid[source]) ? grid[source] : [];
      grid[slot] = Array.from({ length: cols }, (_, col) => copy(original[col] ?? (key === "cells" ? "" : null)));
    } else {
      for (let row = 0; row < rows; row += 1) {
        if (!Array.isArray(grid[row])) grid[row] = [];
        const original = grid[row][source];
        grid[row][slot] = copy(original ?? (key === "cells" ? "" : null));
      }
    }
  }
  for (const key of LISTS[axis]) {
    if (Array.isArray(data[key])) (data[key] as unknown[])[slot] = clone((data[key] as unknown[])[source]);
  }
  const options = rec(data.columnSelectOptions);
  if (axis === "col" && options[source]) data.columnSelectOptions = { ...options, [slot]: clone(options[source]) };
}

export function duplicateTableAxis(raw: JsonMap, data: JsonMap, axis: Axis): boolean {
  const size = Number(axis === "row" ? data.rows : data.cols);
  const source = intField(raw, axis === "row" ? "row" : "column") ?? intField(raw, "index");
  const count = intField(raw, "count") ?? 1;
  if (source === undefined || source < 0 || source >= size || count < 1 || count > 100 || size + count > 1000) return false;
  const weights = (data[axis === "row" ? "rowWeights" : "colWeights"] as number[] | undefined)?.[source];
  const sheetName = raw.__formulaSheetName as string | undefined;
  for (let step = 1; step <= count; step += 1) {
    const slot = source + step;
    if (axis === "row") {
      (data.cells as unknown[][]).splice(slot, 0, []);
      data.rows = Number(data.rows) + 1;
    } else {
      (data.cells as unknown[][]).forEach((row) => row.splice(slot, 0, ""));
      data.cols = Number(data.cols) + 1;
    }
    shiftTableAxis(data, axis, slot, "insert", weights, sheetName);
    copyIntoSlot(data, axis, source, slot, step);
    duplicateStructuresIntoSlot(data, axis, source, slot);
  }
  const holder = raw.__rewrite as { fn?: (formula: string, formulaSheet: string, targetSheet: string) => string } | undefined;
  if (holder) holder.fn = (formula, formulaSheet, targetSheet) => remapFormulaRefs(formula, axis, (index) => (index > source ? index + count : index), targetSheet, formulaSheet);
  if (Array.isArray(data.merges) && (data.merges as unknown[]).length) {
    addNote(raw, `Merges that span the source ${label(axis)} were extended to include the new ${label(axis)}${count > 1 ? "s" : ""}; merges contained in the source ${label(axis)} were copied.`);
  }
  return true;
}

