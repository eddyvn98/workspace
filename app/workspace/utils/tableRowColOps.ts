import { normalizeTableData, type TableBlockData } from "./tableData";
import { insertTableRow } from "./tableRowOps";
import { insertTableCol } from "./tableColOps";
import { transformFormulaForCellMove } from "./tableFormula";

function copyRowMetaInto(data: TableBlockData, fromRow: number, toRow: number): TableBlockData {
  const norm = normalizeTableData(data);
  return {
    ...norm,
    cells: norm.cells.map((row, r) => (r === toRow ? [...norm.cells[fromRow]] : row)),
    ...(norm.formulas ? { formulas: norm.formulas.map((row, r) => (r === toRow ? norm.formulas![fromRow].map((formula) => transformFormulaForCellMove(formula, toRow - fromRow, 0)) : row)) } : {}),
    ...(norm.cellValues ? { cellValues: norm.cellValues.map((row, r) => (r === toRow ? [...(norm.cellValues![fromRow] ?? [])] : row)) } : {}),
    ...(norm.cellFormats ? { cellFormats: norm.cellFormats.map((row, r) => (r === toRow ? norm.cellFormats![fromRow].map((value) => value ? { ...value } : undefined) : row)) } : {}),
    ...(norm.cellContents ? { cellContents: norm.cellContents.map((row, r) => (r === toRow ? norm.cellContents![fromRow].map((c) => ({ ...c })) : row)) } : {}),
    ...(norm.cellFontSizes ? { cellFontSizes: norm.cellFontSizes.map((row, r) => (r === toRow ? [...(norm.cellFontSizes![fromRow] ?? [])] : row)) } : {}),
    ...(norm.cellAlign ? { cellAlign: norm.cellAlign.map((row, r) => (r === toRow ? [...(norm.cellAlign![fromRow] ?? [])] : row)) } : {}),
    ...(norm.cellBgColor ? { cellBgColor: norm.cellBgColor.map((row, r) => (r === toRow ? [...(norm.cellBgColor![fromRow] ?? [])] : row)) } : {}),
    ...(norm.cellTextColor ? { cellTextColor: norm.cellTextColor.map((row, r) => (r === toRow ? [...(norm.cellTextColor![fromRow] ?? [])] : row)) } : {}),
  } as TableBlockData;
}

function copyColMetaInto(data: TableBlockData, fromCol: number, toCol: number): TableBlockData {
  const norm = normalizeTableData(data);
  const pick = <T,>(row: T[] | undefined) => (row ? row[fromCol] : undefined);
  return {
    ...norm,
    cells: norm.cells.map((row) => row.map((v, c) => (c === toCol ? row[fromCol] : v))),
    ...(norm.formulas ? { formulas: norm.formulas.map((row) => row.map((formula, c) => c === toCol ? transformFormulaForCellMove(row[fromCol], 0, toCol - fromCol) : formula)) } : {}),
    ...(norm.cellContents ? { cellContents: norm.cellContents.map((row) => row.map((v, c) => (c === toCol ? { ...row[fromCol] } : v))) } : {}),
    ...(norm.cellFontSizes ? { cellFontSizes: norm.cellFontSizes.map((row) => row.map((v, c) => (c === toCol ? pick(row) : v))) } : {}),
    ...(norm.cellAlign ? { cellAlign: norm.cellAlign.map((row) => row.map((v, c) => (c === toCol ? pick(row) : v))) } : {}),
    ...(norm.cellBgColor ? { cellBgColor: norm.cellBgColor.map((row) => row.map((v, c) => (c === toCol ? pick(row) : v))) } : {}),
    ...(norm.cellTextColor ? { cellTextColor: norm.cellTextColor.map((row) => row.map((v, c) => (c === toCol ? pick(row) : v))) } : {}),
    ...(norm.cellValues ? { cellValues: norm.cellValues.map((row) => row.map((v, c) => (c === toCol ? pick(row) : v))) } : {}),
    ...(norm.cellFormats ? { cellFormats: norm.cellFormats.map((row) => row.map((v, c) => (c === toCol ? pick(row) : v))) } : {}),
    ...(norm.columnFormats ? { columnFormats: norm.columnFormats.map((v, c) => (c === toCol ? norm.columnFormats![fromCol] : v)) } : {}),
    ...(norm.columnTypes ? { columnTypes: norm.columnTypes.map((v, c) => (c === toCol ? norm.columnTypes![fromCol] : v)) } : {}),
    ...(norm.columnSelectOptions?.[fromCol]
      ? { columnSelectOptions: { ...norm.columnSelectOptions, [toCol]: norm.columnSelectOptions[fromCol].map((o) => ({ ...o })) } }
      : {}),
  } as TableBlockData;
}

/** Inserts a fresh row right below `rowIndex`, then copies that row's cell
 *  content/formatting into it. Merge regions are intentionally NOT
 *  duplicated - a duplicated merge spanning two freshly-split rows has no
 *  sane meaning. */
export function duplicateTableRow(data: Partial<TableBlockData> | undefined, rowIndex: number): TableBlockData {
  const withNewRow = insertTableRow(data, rowIndex + 1);
  return copyRowMetaInto(withNewRow, rowIndex, rowIndex + 1);
}

export function duplicateTableCol(data: Partial<TableBlockData> | undefined, colIndex: number): TableBlockData {
  const withNewCol = insertTableCol(data, colIndex + 1);
  return copyColMetaInto(withNewCol, colIndex, colIndex + 1);
}

function rowTouchesSpanningMerge(norm: ReturnType<typeof normalizeTableData>, row: number): boolean {
  return (norm.merges ?? []).some((m) => m.rowSpan > 1 && row >= m.row && row < m.row + m.rowSpan);
}

function colTouchesSpanningMerge(norm: ReturnType<typeof normalizeTableData>, col: number): boolean {
  return (norm.merges ?? []).some((m) => m.colSpan > 1 && col >= m.col && col < m.col + m.colSpan);
}

/** Swaps two adjacent rows/columns - used for the "move up/down"/"move
 *  left/right" reorder actions. Refuses (returns input unchanged) if either
 *  side is inside a row/col-spanning merge, since swapping would tear it. */
export function swapTableRows(data: Partial<TableBlockData> | undefined, rowA: number, rowB: number): TableBlockData {
  const norm = normalizeTableData(data);
  if (rowA < 0 || rowB < 0 || rowA >= norm.rows || rowB >= norm.rows) return norm as TableBlockData;
  if (rowTouchesSpanningMerge(norm, rowA) || rowTouchesSpanningMerge(norm, rowB)) return norm as TableBlockData;
  const swap = <T,>(arr: T[] | undefined) => {
    if (!arr) return arr;
    const next = [...arr];
    [next[rowA], next[rowB]] = [next[rowB], next[rowA]];
    return next;
  };
  return {
    ...norm,
    cells: swap(norm.cells),
    ...(norm.formulas ? { formulas: swap(norm.formulas) } : {}),
    ...(norm.cellValues ? { cellValues: swap(norm.cellValues) } : {}),
    ...(norm.cellFormats ? { cellFormats: swap(norm.cellFormats) } : {}),
    ...(norm.cellContents ? { cellContents: swap(norm.cellContents) } : {}),
    ...(norm.cellFontSizes ? { cellFontSizes: swap(norm.cellFontSizes) } : {}),
    ...(norm.cellAlign ? { cellAlign: swap(norm.cellAlign) } : {}),
    ...(norm.cellBgColor ? { cellBgColor: swap(norm.cellBgColor) } : {}),
    ...(norm.cellTextColor ? { cellTextColor: swap(norm.cellTextColor) } : {}),
  } as TableBlockData;
}

export function swapTableCols(data: Partial<TableBlockData> | undefined, colA: number, colB: number): TableBlockData {
  const norm = normalizeTableData(data);
  if (colA < 0 || colB < 0 || colA >= norm.cols || colB >= norm.cols) return norm as TableBlockData;
  if (colTouchesSpanningMerge(norm, colA) || colTouchesSpanningMerge(norm, colB)) return norm as TableBlockData;
  const swapRow = <T,>(row: T[]) => {
    const next = [...row];
    [next[colA], next[colB]] = [next[colB], next[colA]];
    return next;
  };
  return {
    ...norm,
    cells: norm.cells.map(swapRow),
    ...(norm.formulas ? { formulas: norm.formulas.map(swapRow) } : {}),
    ...(norm.cellContents ? { cellContents: norm.cellContents.map(swapRow) } : {}),
    ...(norm.cellFontSizes ? { cellFontSizes: norm.cellFontSizes.map(swapRow) } : {}),
    ...(norm.cellAlign ? { cellAlign: norm.cellAlign.map(swapRow) } : {}),
    ...(norm.cellBgColor ? { cellBgColor: norm.cellBgColor.map(swapRow) } : {}),
    ...(norm.cellTextColor ? { cellTextColor: norm.cellTextColor.map(swapRow) } : {}),
    ...(norm.columnTypes ? { columnTypes: swapRow(norm.columnTypes) } : {}),
    ...(norm.columnFormats ? { columnFormats: swapRow(norm.columnFormats) } : {}),
    ...(norm.columnSelectOptions
      ? { columnSelectOptions: { ...norm.columnSelectOptions, [colA]: norm.columnSelectOptions[colB], [colB]: norm.columnSelectOptions[colA] } }
      : {}),
  } as TableBlockData;
}
