import { parseCellReference } from "@/app/workspace/utils/tableFormula";
import type { JsonMap } from "./operationsTables";

export type TableRange = { row: [number, number]; column: [number, number] };

export function parseTableFormatRange(value: unknown, rows: number, cols: number): TableRange | null {
  let range: TableRange;
  if (typeof value === "string") {
    const parts = value.split(":");
    if (parts.length > 2) return null;
    const start = parseCellReference(parts[0]);
    const end = parseCellReference(parts[1] ?? parts[0]);
    if (!start || !end) return null;
    range = { row: [start.row, end.row], column: [start.col, end.col] };
  } else {
    const candidate = value as Partial<TableRange> | null;
    if (!candidate || !Array.isArray(candidate.row) || !Array.isArray(candidate.column)
      || candidate.row.length !== 2 || candidate.column.length !== 2) return null;
    range = { row: [...candidate.row], column: [...candidate.column] };
  }
  if (![...range.row, ...range.column].every(Number.isInteger)) return null;
  range.row.sort((a, b) => a - b);
  range.column.sort((a, b) => a - b);
  return range.row[0] >= 0 && range.column[0] >= 0 && range.row[1] < rows && range.column[1] < cols ? range : null;
}

export function positionsInRange(range: TableRange) {
  return Array.from({ length: range.row[1] - range.row[0] + 1 }, (_, row) =>
    Array.from({ length: range.column[1] - range.column[0] + 1 }, (_, column) => ({ row: row + range.row[0], column: column + range.column[0] }))
  ).flat();
}

export function applyRangeMerge(data: JsonMap, range: TableRange, merge: boolean): boolean {
  type Merge = { row: number; col: number; rowSpan: number; colSpan: number };
  const merges = (Array.isArray(data.merges) ? data.merges : []) as Merge[];
  const overlaps = (item: Merge) => item.row <= range.row[1] && item.row + item.rowSpan > range.row[0]
    && item.col <= range.column[1] && item.col + item.colSpan > range.column[0];
  if (merge && merges.some((item) => overlaps(item) && (item.row < range.row[0] || item.col < range.column[0]
    || item.row + item.rowSpan - 1 > range.row[1] || item.col + item.colSpan - 1 > range.column[1]))) return false;
  const next = merges.filter((item) => !overlaps(item));
  if (merge) {
    const rowSpan = range.row[1] - range.row[0] + 1;
    const colSpan = range.column[1] - range.column[0] + 1;
    if (rowSpan * colSpan < 2) return false;
    next.push({ row: range.row[0], col: range.column[0], rowSpan, colSpan });
  }
  data.merges = next;
  return true;
}
