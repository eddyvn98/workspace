import type { BlockDataMap, TableCellAlign } from "../types/block";

export type TableBlockData = BlockDataMap["table"];
export { normalizeTableData } from "./tableData";
export { insertTableRow, deleteTableRow } from "./tableRowOps";
export { insertTableCol, deleteTableCol } from "./tableColOps";
export { duplicateTableRow, duplicateTableCol, swapTableRows, swapTableCols } from "./tableRowColOps";
export { mergeCellsRight, mergeCellsDown, unmergeCell, findMergeAt, type TableMerge } from "./tableMergeOps";

export function getCellFontSize(sizes: number[][] | undefined, r: number, c: number): number {
  const val = sizes?.[r]?.[c];
  return typeof val === "number" && Number.isFinite(val) ? val : 14;
}

export function getCellAlign(
  aligns: (TableCellAlign | undefined)[][] | undefined,
  r: number,
  c: number
): TableCellAlign {
  const val = aligns?.[r]?.[c];
  return val === "center" || val === "right" ? val : "left";
}

export function getCellBgColor(colors: (string | undefined)[][] | undefined, r: number, c: number): string | undefined {
  return colors?.[r]?.[c];
}

export function getCellTextColor(colors: (string | undefined)[][] | undefined, r: number, c: number): string | undefined {
  return colors?.[r]?.[c];
}
