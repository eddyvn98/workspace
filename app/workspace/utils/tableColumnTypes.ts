import type { TableColumnOption, TableColumnType, TableFilterSpec, TableSortSpec } from "../types/table";
import type { TableBlockData } from "./tableCellOps";

export const DEFAULT_COLUMN_TYPE: TableColumnType = "text";

export function getColumnType(types: TableColumnType[] | undefined, col: number): TableColumnType {
  return types?.[col] ?? DEFAULT_COLUMN_TYPE;
}

export function getColumnOptions(
  options: Record<number, TableColumnOption[]> | undefined,
  col: number
): TableColumnOption[] {
  return options?.[col] ?? [];
}

export function shiftColumnTypesForInsert(types: TableColumnType[], insertIdx: number): TableColumnType[] {
  return [...types.slice(0, insertIdx), DEFAULT_COLUMN_TYPE, ...types.slice(insertIdx)];
}

export function shiftColumnTypesForDelete(types: TableColumnType[], deleteIdx: number): TableColumnType[] {
  return types.filter((_, idx) => idx !== deleteIdx);
}

function remapOptionKeys(
  options: Record<number, TableColumnOption[]>,
  mapCol: (col: number) => number | null
): Record<number, TableColumnOption[]> {
  const result: Record<number, TableColumnOption[]> = {};
  for (const [key, value] of Object.entries(options)) {
    const next = mapCol(Number(key));
    if (next !== null) result[next] = value;
  }
  return result;
}

export function shiftColumnSelectOptionsForInsert(
  options: Record<number, TableColumnOption[]>,
  insertIdx: number
): Record<number, TableColumnOption[]> {
  return remapOptionKeys(options, (col) => (col >= insertIdx ? col + 1 : col));
}

export function shiftColumnSelectOptionsForDelete(
  options: Record<number, TableColumnOption[]>,
  deleteIdx: number
): Record<number, TableColumnOption[]> {
  return remapOptionKeys(options, (col) => (col === deleteIdx ? null : col > deleteIdx ? col - 1 : col));
}

/** Sort/filter reference a single column index; on structural col edits they
 *  either shift along with that column or (if it was the deleted column)
 *  are cleared, since "sort by a column that no longer exists" is meaningless. */
export function remapColRefForInsert<T extends { col: number }>(spec: T | null | undefined, insertIdx: number): T | null {
  if (!spec) return null;
  return spec.col >= insertIdx ? { ...spec, col: spec.col + 1 } : spec;
}

export function remapColRefForDelete<T extends { col: number }>(spec: T | null | undefined, deleteIdx: number): T | null {
  if (!spec) return null;
  if (spec.col === deleteIdx) return null;
  return spec.col > deleteIdx ? { ...spec, col: spec.col - 1 } : spec;
}

function compareByColumnType(a: string, b: string, type: TableColumnType): number {
  if (type === "number") return (Number.parseFloat(a) || 0) - (Number.parseFloat(b) || 0);
  if (type === "date") return (Date.parse(a) || 0) - (Date.parse(b) || 0);
  return a.localeCompare(b);
}

/** Row indices in filter-then-sort order. Returns 0..rows-1 unchanged when
 *  neither is set. Merges make "which row is this visually" ambiguous, so
 *  callers gate sort/filter off entirely while any merge exists (see
 *  TableBlock.tsx) rather than trying to reconcile the two. */
export function visibleRowIndices(
  data: Pick<TableBlockData, "rows" | "cells" | "columnTypes">,
  sortCol: TableSortSpec | null | undefined,
  filterCol: TableFilterSpec | null | undefined
): number[] {
  let indices = Array.from({ length: data.rows }, (_, r) => r);
  if (filterCol) {
    indices = indices.filter((r) => data.cells[r]?.[filterCol.col] === filterCol.optionId);
  }
  if (sortCol) {
    const type = getColumnType(data.columnTypes, sortCol.col);
    const dir = sortCol.dir === "desc" ? -1 : 1;
    indices = [...indices].sort((a, b) => dir * compareByColumnType(data.cells[a]?.[sortCol.col] ?? "", data.cells[b]?.[sortCol.col] ?? "", type));
  }
  return indices;
}
