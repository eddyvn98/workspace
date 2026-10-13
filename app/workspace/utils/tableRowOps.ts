import { emptyCellContent, normalizeTableData, type TableBlockData } from "./tableData";
import { shiftMergesForRowDelete, shiftMergesForRowInsert } from "./tableMergeOps";
import { remapCellItems } from "./tableCellItemsRemap";
import { shiftFormulasForRowDelete, shiftFormulasForRowInsert } from "./tableFormula";

export function insertTableRow(
  data: Partial<TableBlockData> | undefined,
  rowIndex: number
): TableBlockData {
  const norm = normalizeTableData(data);
  const insertIdx = Math.max(0, Math.min(norm.rows, rowIndex));
  const newRows = norm.rows + 1;
  const newCols = norm.cols;
  const newCells = [
    ...norm.cells.slice(0, insertIdx),
    new Array(newCols).fill(""),
    ...norm.cells.slice(insertIdx),
  ];

  const result: TableBlockData = {
    rows: newRows,
    cols: newCols,
    cells: newCells,
    ...(norm.mode ? { mode: norm.mode } : {}),
    ...(norm.formulas ? { formulas: shiftFormulasForRowInsert(norm.formulas, insertIdx, newRows, newCols) } : {}),
  };

  if (norm.cellContents) {
    result.cellContents = [
      ...norm.cellContents.slice(0, insertIdx),
      Array.from({ length: newCols }, emptyCellContent),
      ...norm.cellContents.slice(insertIdx),
    ];
  }

  if (norm.cellValues) {
    result.cellValues = [
      ...norm.cellValues.slice(0, insertIdx),
      [],
      ...norm.cellValues.slice(insertIdx),
    ];
  }

  if (norm.cellFormats) {
    result.cellFormats = [
      ...norm.cellFormats.slice(0, insertIdx),
      [],
      ...norm.cellFormats.slice(insertIdx),
    ];
  }

  if (norm.columnFormats) result.columnFormats = [...norm.columnFormats];

  if (norm.rowWeights) {
    result.rowWeights = [
      ...norm.rowWeights.slice(0, insertIdx),
      1,
      ...norm.rowWeights.slice(insertIdx),
    ];
  }

  if (norm.colWeights) {
    result.colWeights = [...norm.colWeights];
  }

  if (norm.cellFontSizes) {
    result.cellFontSizes = [
      ...norm.cellFontSizes.slice(0, insertIdx),
      [],
      ...norm.cellFontSizes.slice(insertIdx),
    ];
  }

  if (norm.cellAlign) {
    result.cellAlign = [
      ...norm.cellAlign.slice(0, insertIdx),
      [],
      ...norm.cellAlign.slice(insertIdx),
    ];
  }

  if (norm.cellBgColor) {
    result.cellBgColor = [...norm.cellBgColor.slice(0, insertIdx), [], ...norm.cellBgColor.slice(insertIdx)];
  }

  if (norm.cellTextColor) {
    result.cellTextColor = [...norm.cellTextColor.slice(0, insertIdx), [], ...norm.cellTextColor.slice(insertIdx)];
  }

  if (norm.merges) {
    result.merges = shiftMergesForRowInsert(norm.merges, insertIdx);
  }

  if (norm.cellItems) {
    result.cellItems = remapCellItems(norm.cellItems, (row, col) => ({
      row: row >= insertIdx ? row + 1 : row,
      col,
    }));
  }

  return result;
}

export function deleteTableRow(
  data: Partial<TableBlockData> | undefined,
  rowIndex: number
): TableBlockData {
  const norm = normalizeTableData(data);
  if (norm.rows <= 1) {
    return {
      rows: norm.rows,
      cols: norm.cols,
      cells: norm.cells,
      ...(norm.mode ? { mode: norm.mode } : {}),
      ...(norm.formulas ? { formulas: norm.formulas } : {}),
      ...(norm.cellValues ? { cellValues: norm.cellValues } : {}),
      ...(norm.cellFormats ? { cellFormats: norm.cellFormats } : {}),
      ...(norm.columnFormats ? { columnFormats: norm.columnFormats } : {}),
      ...(norm.cellContents ? { cellContents: norm.cellContents } : {}),
      ...(norm.rowWeights ? { rowWeights: norm.rowWeights } : {}),
      ...(norm.colWeights ? { colWeights: norm.colWeights } : {}),
      ...(norm.cellFontSizes ? { cellFontSizes: norm.cellFontSizes } : {}),
      ...(norm.cellAlign ? { cellAlign: norm.cellAlign } : {}),
      ...(norm.cellBgColor ? { cellBgColor: norm.cellBgColor } : {}),
      ...(norm.cellTextColor ? { cellTextColor: norm.cellTextColor } : {}),
      ...(norm.merges ? { merges: norm.merges } : {}),
      ...(norm.cellItems ? { cellItems: remapCellItems(norm.cellItems, (row, col) => ({ row, col })) } : {}),
    };
  }

  const deleteIdx = Math.max(0, Math.min(norm.rows - 1, rowIndex));
  const newRows = norm.rows - 1;
  const newCols = norm.cols;
  const newCells = norm.cells.filter((_, idx) => idx !== deleteIdx);

  const result: TableBlockData = {
    rows: newRows,
    cols: newCols,
    cells: newCells,
    ...(norm.mode ? { mode: norm.mode } : {}),
    ...(norm.formulas ? { formulas: shiftFormulasForRowDelete(norm.formulas, deleteIdx, norm.rows, norm.cols) } : {}),
  };

  if (norm.cellContents) {
    result.cellContents = norm.cellContents.filter((_, idx) => idx !== deleteIdx);
  }

  if (norm.cellValues) result.cellValues = norm.cellValues.filter((_, idx) => idx !== deleteIdx);
  if (norm.cellFormats) result.cellFormats = norm.cellFormats.filter((_, idx) => idx !== deleteIdx);
  if (norm.columnFormats) result.columnFormats = [...norm.columnFormats];

  if (norm.rowWeights) {
    result.rowWeights = norm.rowWeights.filter((_, idx) => idx !== deleteIdx);
  }

  if (norm.colWeights) {
    result.colWeights = [...norm.colWeights];
  }

  if (norm.cellFontSizes) {
    result.cellFontSizes = norm.cellFontSizes.filter((_, idx) => idx !== deleteIdx);
  }

  if (norm.cellAlign) {
    result.cellAlign = norm.cellAlign.filter((_, idx) => idx !== deleteIdx);
  }

  if (norm.cellBgColor) result.cellBgColor = norm.cellBgColor.filter((_, idx) => idx !== deleteIdx);
  if (norm.cellTextColor) result.cellTextColor = norm.cellTextColor.filter((_, idx) => idx !== deleteIdx);
  if (norm.merges) result.merges = shiftMergesForRowDelete(norm.merges, deleteIdx);

  if (norm.cellItems) {
    result.cellItems = remapCellItems(norm.cellItems, (row, col) =>
      row === deleteIdx ? null : { row: row > deleteIdx ? row - 1 : row, col }
    );
  }

  return result;
}
