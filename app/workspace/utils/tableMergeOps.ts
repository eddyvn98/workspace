import type { TableMerge } from "./tableData";
import { normalizeTableData, type TableBlockData } from "./tableData";

export type { TableMerge } from "./tableData";

/** Ragged-row-safe column insert: pads/truncates each row to its own length,
 *  matching cellFontSizes/cellAlign's insert-on-column-add behavior. */
export function insertColInRaggedRows<T>(rows: (T[] | undefined)[], insertIdx: number, fill: T): (T[])[] {
  return rows.map((row) => {
    if (!Array.isArray(row) || row.length === 0) return [];
    if (insertIdx >= row.length) return [...row];
    return [...row.slice(0, insertIdx), fill, ...row.slice(insertIdx)];
  });
}

function shiftAxis(value: number, insertIdx: number, span: number): number {
  return value >= insertIdx ? value + span : value;
}

export function shiftMergesForRowInsert(merges: TableMerge[], insertIdx: number): TableMerge[] {
  return merges.map((m) => {
    if (insertIdx > m.row && insertIdx < m.row + m.rowSpan) return { ...m, rowSpan: m.rowSpan + 1 };
    return { ...m, row: shiftAxis(m.row, insertIdx, 1) };
  });
}

export function shiftMergesForColInsert(merges: TableMerge[], insertIdx: number): TableMerge[] {
  return merges.map((m) => {
    if (insertIdx > m.col && insertIdx < m.col + m.colSpan) return { ...m, colSpan: m.colSpan + 1 };
    return { ...m, col: shiftAxis(m.col, insertIdx, 1) };
  });
}

/** Deleting a row through the middle of a merge just shrinks its span; a merge
 *  reduced to a 1x1 span is dropped (no longer a merge, nothing to render specially). */
export function shiftMergesForRowDelete(merges: TableMerge[], deleteIdx: number): TableMerge[] {
  const result: TableMerge[] = [];
  for (const m of merges) {
    if (deleteIdx >= m.row && deleteIdx < m.row + m.rowSpan) {
      const rowSpan = m.rowSpan - 1;
      if (rowSpan >= 1 && m.colSpan >= 1 && (rowSpan > 1 || m.colSpan > 1)) result.push({ ...m, rowSpan });
      continue;
    }
    result.push({ ...m, row: m.row > deleteIdx ? m.row - 1 : m.row });
  }
  return result;
}

export function shiftMergesForColDelete(merges: TableMerge[], deleteIdx: number): TableMerge[] {
  const result: TableMerge[] = [];
  for (const m of merges) {
    if (deleteIdx >= m.col && deleteIdx < m.col + m.colSpan) {
      const colSpan = m.colSpan - 1;
      if (colSpan >= 1 && m.rowSpan >= 1 && (colSpan > 1 || m.rowSpan > 1)) result.push({ ...m, colSpan });
      continue;
    }
    result.push({ ...m, col: m.col > deleteIdx ? m.col - 1 : m.col });
  }
  return result;
}

function overlaps(a: TableMerge, row: number, col: number, rowSpan: number, colSpan: number): boolean {
  return row < a.row + a.rowSpan && row + rowSpan > a.row && col < a.col + a.colSpan && col + colSpan > a.col;
}

/** Finds the merge region (if any) covering (row, col) - either as its anchor
 *  (top-left) or one of the cells it spans over. */
export function findMergeAt(merges: TableMerge[] | undefined, row: number, col: number): TableMerge | null {
  return merges?.find((m) => row >= m.row && row < m.row + m.rowSpan && col >= m.col && col < m.col + m.colSpan) ?? null;
}

function mergeRegion(data: Partial<TableBlockData> | undefined, row: number, col: number, rowSpan: number, colSpan: number): TableBlockData {
  const norm = normalizeTableData(data);
  if (row + rowSpan > norm.rows || col + colSpan > norm.cols) return norm as TableBlockData;
  const existing = norm.merges ?? [];
  // Merging over cells already covered by another merge would create an
  // overlapping (undefined) layout - drop any merge fully inside the new
  // region and refuse if a merge only partially overlaps it.
  const conflicting = existing.some((m) => overlaps(m, row, col, rowSpan, colSpan) && !(m.row >= row && m.col >= col && m.row + m.rowSpan <= row + rowSpan && m.col + m.colSpan <= col + colSpan));
  if (conflicting) return norm as TableBlockData;
  const kept = existing.filter((m) => !overlaps(m, row, col, rowSpan, colSpan));
  return { ...norm, merges: [...kept, { row, col, rowSpan, colSpan }] } as TableBlockData;
}

export function mergeCellsRight(data: Partial<TableBlockData> | undefined, row: number, col: number): TableBlockData {
  const norm = normalizeTableData(data);
  const current = findMergeAt(norm.merges, row, col);
  const anchorRow = current?.row ?? row;
  const anchorCol = current?.col ?? col;
  const rowSpan = current?.rowSpan ?? 1;
  const colSpan = (current?.colSpan ?? 1) + 1;
  return mergeRegion(norm as TableBlockData, anchorRow, anchorCol, rowSpan, colSpan);
}

export function mergeCellsDown(data: Partial<TableBlockData> | undefined, row: number, col: number): TableBlockData {
  const norm = normalizeTableData(data);
  const current = findMergeAt(norm.merges, row, col);
  const anchorRow = current?.row ?? row;
  const anchorCol = current?.col ?? col;
  const rowSpan = (current?.rowSpan ?? 1) + 1;
  const colSpan = current?.colSpan ?? 1;
  return mergeRegion(norm as TableBlockData, anchorRow, anchorCol, rowSpan, colSpan);
}

export function unmergeCell(data: Partial<TableBlockData> | undefined, row: number, col: number): TableBlockData {
  const norm = normalizeTableData(data);
  const target = findMergeAt(norm.merges, row, col);
  if (!target) return norm as TableBlockData;
  return { ...norm, merges: (norm.merges ?? []).filter((m) => m !== target) } as TableBlockData;
}
