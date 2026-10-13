import { emptyCellContent, normalizeTableData, type TableBlockData } from "./tableData";
import { insertColInRaggedRows, shiftMergesForColDelete, shiftMergesForColInsert } from "./tableMergeOps";
import { remapCellItems } from "./tableCellItemsRemap";
import {
  remapColRefForDelete,
  remapColRefForInsert,
  shiftColumnSelectOptionsForDelete,
  shiftColumnSelectOptionsForInsert,
  shiftColumnTypesForDelete,
  shiftColumnTypesForInsert,
} from "./tableColumnTypes";
import { shiftFormulasForColDelete, shiftFormulasForColInsert } from "./tableFormula";

export function insertTableCol(
  data: Partial<TableBlockData> | undefined,
  colIndex: number
): TableBlockData {
  const norm = normalizeTableData(data);
  const insertIdx = Math.max(0, Math.min(norm.cols, colIndex));
  const newRows = norm.rows;
  const newCols = norm.cols + 1;
  const newCells = norm.cells.map((row) => [
    ...row.slice(0, insertIdx),
    "",
    ...row.slice(insertIdx),
  ]);

  const result: TableBlockData = {
    rows: newRows,
    cols: newCols,
    cells: newCells,
    ...(norm.mode ? { mode: norm.mode } : {}),
    ...(norm.formulas ? { formulas: shiftFormulasForColInsert(norm.formulas, insertIdx, newRows, newCols) } : {}),
  };

  if (norm.cellContents) {
    result.cellContents = norm.cellContents.map((row) => [
      ...row.slice(0, insertIdx),
      emptyCellContent(),
      ...row.slice(insertIdx),
    ]);
  }

  if (norm.cellValues) {
    result.cellValues = norm.cellValues.map((row) => [
      ...row.slice(0, insertIdx),
      undefined,
      ...row.slice(insertIdx),
    ]);
  }

  if (norm.cellFormats) {
    result.cellFormats = norm.cellFormats.map((row) => [
      ...row.slice(0, insertIdx),
      undefined,
      ...row.slice(insertIdx),
    ]);
  }

  if (norm.columnFormats) {
    result.columnFormats = [
      ...norm.columnFormats.slice(0, insertIdx),
      undefined,
      ...norm.columnFormats.slice(insertIdx),
    ];
  }

  if (norm.rowWeights) {
    result.rowWeights = [...norm.rowWeights];
  }

  if (norm.colWeights) {
    result.colWeights = [
      ...norm.colWeights.slice(0, insertIdx),
      1,
      ...norm.colWeights.slice(insertIdx),
    ];
  }

  if (norm.cellFontSizes) {
    result.cellFontSizes = norm.cellFontSizes.map((row) => {
      if (!Array.isArray(row) || row.length === 0) return [];
      if (insertIdx >= row.length) return [...row];
      return [...row.slice(0, insertIdx), 14, ...row.slice(insertIdx)];
    });
  }

  if (norm.cellAlign) {
    result.cellAlign = norm.cellAlign.map((row) => {
      if (!Array.isArray(row) || row.length === 0) return [];
      if (insertIdx >= row.length) return [...row];
      return [...row.slice(0, insertIdx), undefined, ...row.slice(insertIdx)];
    });
  }

  if (norm.cellBgColor) result.cellBgColor = insertColInRaggedRows(norm.cellBgColor, insertIdx, undefined);
  if (norm.cellTextColor) result.cellTextColor = insertColInRaggedRows(norm.cellTextColor, insertIdx, undefined);
  if (norm.merges) result.merges = shiftMergesForColInsert(norm.merges, insertIdx);
  if (norm.columnTypes) result.columnTypes = shiftColumnTypesForInsert(norm.columnTypes, insertIdx);
  if (norm.columnSelectOptions) result.columnSelectOptions = shiftColumnSelectOptionsForInsert(norm.columnSelectOptions, insertIdx);
  if (norm.sortCol !== undefined) result.sortCol = remapColRefForInsert(norm.sortCol, insertIdx);
  if (norm.filterCol !== undefined) result.filterCol = remapColRefForInsert(norm.filterCol, insertIdx);

  if (norm.cellItems) {
    result.cellItems = remapCellItems(norm.cellItems, (row, col) => ({
      row,
      col: col >= insertIdx ? col + 1 : col,
    }));
  }

  return result;
}

export function deleteTableCol(
  data: Partial<TableBlockData> | undefined,
  colIndex: number
): TableBlockData {
  const norm = normalizeTableData(data);
  if (norm.cols <= 1) {
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
      ...(norm.columnTypes ? { columnTypes: norm.columnTypes } : {}),
      ...(norm.columnSelectOptions ? { columnSelectOptions: norm.columnSelectOptions } : {}),
      ...(norm.sortCol !== undefined ? { sortCol: norm.sortCol } : {}),
      ...(norm.filterCol !== undefined ? { filterCol: norm.filterCol } : {}),
      ...(norm.cellItems ? { cellItems: remapCellItems(norm.cellItems, (row, col) => ({ row, col })) } : {}),
    };
  }

  const deleteIdx = Math.max(0, Math.min(norm.cols - 1, colIndex));
  const newRows = norm.rows;
  const newCols = norm.cols - 1;
  const newCells = norm.cells.map((row) =>
    row.filter((_, idx) => idx !== deleteIdx)
  );

  const result: TableBlockData = {
    rows: newRows,
    cols: newCols,
    cells: newCells,
    ...(norm.mode ? { mode: norm.mode } : {}),
    ...(norm.formulas ? { formulas: shiftFormulasForColDelete(norm.formulas, deleteIdx, newRows, norm.cols) } : {}),
  };

  if (norm.cellContents) {
    result.cellContents = norm.cellContents.map((row) => row.filter((_, idx) => idx !== deleteIdx));
  }

  if (norm.cellValues) result.cellValues = norm.cellValues.map((row) => row.filter((_, idx) => idx !== deleteIdx));
  if (norm.cellFormats) result.cellFormats = norm.cellFormats.map((row) => row.filter((_, idx) => idx !== deleteIdx));
  if (norm.columnFormats) result.columnFormats = norm.columnFormats.filter((_, idx) => idx !== deleteIdx);

  if (norm.rowWeights) {
    result.rowWeights = [...norm.rowWeights];
  }

  if (norm.colWeights) {
    result.colWeights = norm.colWeights.filter((_, idx) => idx !== deleteIdx);
  }

  if (norm.cellFontSizes) {
    result.cellFontSizes = norm.cellFontSizes.map((row) =>
      Array.isArray(row) ? row.filter((_, idx) => idx !== deleteIdx) : []
    );
  }

  if (norm.cellAlign) {
    result.cellAlign = norm.cellAlign.map((row) =>
      Array.isArray(row) ? row.filter((_, idx) => idx !== deleteIdx) : []
    );
  }

  if (norm.cellBgColor) result.cellBgColor = norm.cellBgColor.map((row) => Array.isArray(row) ? row.filter((_, idx) => idx !== deleteIdx) : []);
  if (norm.cellTextColor) result.cellTextColor = norm.cellTextColor.map((row) => Array.isArray(row) ? row.filter((_, idx) => idx !== deleteIdx) : []);
  if (norm.merges) result.merges = shiftMergesForColDelete(norm.merges, deleteIdx);
  if (norm.columnTypes) result.columnTypes = shiftColumnTypesForDelete(norm.columnTypes, deleteIdx);
  if (norm.columnSelectOptions) result.columnSelectOptions = shiftColumnSelectOptionsForDelete(norm.columnSelectOptions, deleteIdx);
  if (norm.sortCol !== undefined) result.sortCol = remapColRefForDelete(norm.sortCol, deleteIdx);
  if (norm.filterCol !== undefined) result.filterCol = remapColRefForDelete(norm.filterCol, deleteIdx);

  if (norm.cellItems) {
    result.cellItems = remapCellItems(norm.cellItems, (row, col) =>
      col === deleteIdx ? null : { row, col: col > deleteIdx ? col - 1 : col }
    );
  }

  return result;
}
