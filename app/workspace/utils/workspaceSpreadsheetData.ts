import type { Cell, CellWithRowAndCol, Sheet } from "@fortune-sheet/core";
import type { CanvasBlock } from "../types/block";
import type { TableBlockPayload, TableCellAlignment, TableCellContent, TableCellFormat, TableCellMarks, TableCellValue } from "../types/table";
import { cellFromTable } from "./workspaceSpreadsheetCell";
import { textTableCellContent } from "../components/table/tableCellContent";
import { hasCellStructure, readSheetStructure, sheetStructureToFortune, structureConfigToFortune } from "./workspaceSpreadsheetStructure";

const MIN_ROWS = 1;
const MIN_COLS = 1;
const DEFAULT_EDITOR_ROWS = 100;
const DEFAULT_EDITOR_COLS = 26;

export interface TableSheetOptions {
  expandEmptyGrid?: boolean;
}

function asText(value: Cell["v"] | Cell["m"] | undefined): string {
  return value === undefined || value === null ? "" : String(value);
}

function normalizedFormula(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const formula = value.trim();
  return formula.startsWith("=") ? formula : `=${formula}`;
}

function cloneGrid<T>(grid: T[][] | undefined, rows: number, cols: number): T[][] {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => grid?.[row]?.[col] as T)
  );
}

function hasGridValue<T>(grid: T[][]): boolean {
  return grid.some((row) => row.some((value) => value !== undefined && value !== null && value !== ""));
}

function hasPersistableCellValue(cell: Cell | null | undefined, includeFormat = true): boolean {
  if (!cell) return false;
  const hasValue = [cell.v, cell.m, cell.f].some((value) => value !== undefined && value !== null && String(value) !== "");
  const hasStyle = cell.bg !== undefined || cell.fc !== undefined || cell.fs !== undefined
    || cell.bl === 1 || cell.it === 1 || cell.un === 1 || cell.ht !== undefined || cell.vt !== undefined || hasCellStructure(cell);
  const hasFormat = includeFormat && Boolean(cell.ct?.fa);
  return hasValue || hasStyle || hasFormat || cell.mc !== undefined;
}

function mergeConfig(data: TableBlockPayload): NonNullable<NonNullable<Sheet["config"]>["merge"]> {
  return Object.fromEntries((data.merges ?? []).map((merge) => [
    `${merge.row}_${merge.col}`,
    { r: merge.row, c: merge.col, rs: merge.rowSpan, cs: merge.colSpan },
  ]));
}

export function tableBlockToFortuneSheet(block: CanvasBlock<"table">, options: TableSheetOptions = {}): Sheet {
  const data = block.data;
  const rows = Math.max(
    MIN_ROWS,
    data.rows || data.cells.length || MIN_ROWS,
    options.expandEmptyGrid ? DEFAULT_EDITOR_ROWS : MIN_ROWS,
  );
  const cols = Math.max(
    MIN_COLS,
    data.cols || data.cells[0]?.length || MIN_COLS,
    options.expandEmptyGrid ? DEFAULT_EDITOR_COLS : MIN_COLS,
  );
  const matrix = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => cellFromTable(data, row, col))
  );
  for (const merge of data.merges ?? []) {
    for (let row = merge.row; row < Math.min(rows, merge.row + merge.rowSpan); row++) {
      for (let col = merge.col; col < Math.min(cols, merge.col + merge.colSpan); col++) {
        const cell = matrix[row]?.[col];
        if (cell) cell.mc = row === merge.row && col === merge.col
          ? { r: merge.row, c: merge.col, rs: merge.rowSpan, cs: merge.colSpan }
          : { r: merge.row, c: merge.col };
      }
    }
  }
  const celldata: CellWithRowAndCol[] = [];
  matrix.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
    if (cell) celldata.push({ r: rowIndex, c: colIndex, v: cell });
  }));
  const config = mergeConfig(data);
  return {
    id: block.id,
    name: "Sheet1",
    row: rows,
    column: cols,
    celldata,
    ...sheetStructureToFortune(data),
    config: {
      ...structureConfigToFortune(data),
      ...(Object.keys(config).length ? { merge: config } : {}),
      rowlen: Object.fromEntries((data.rowHeights ?? []).map((height, index) => [index, height])),
      columnlen: Object.fromEntries((data.columnWidths ?? []).map((width, index) => [index, width])),
    },
    defaultColWidth: 110,
    defaultRowHeight: 28,
    showGridLines: true,
  };
}

function formatFromCell(cell: Cell | null | undefined): TableCellFormat | undefined {
  const fa = cell?.ct?.fa;
  if (typeof fa !== "string" || !fa) return undefined;
  const type = typeof cell?.ct?.t === "string" ? cell.ct.t : undefined;
  return { fa, ...(type ? { t: type } : {}) };
}

function sameFormat(left: TableCellFormat | undefined, right: TableCellFormat | undefined): boolean {
  return left?.fa === right?.fa && left?.t === right?.t;
}

function readColumnFormats(sheet: Sheet): (TableCellFormat | undefined)[] {
  const source = sheet.data ?? [];
  const rows = Math.max(sheet.row ?? 0, source.length);
  const cols = Math.max(sheet.column ?? 0, source.reduce((max, row) => Math.max(max, row.length), 0));
  return Array.from({ length: cols }, (_, col) => {
    let candidate: TableCellFormat | undefined;
    for (let row = 0; row < rows; row++) {
      const format = formatFromCell(source[row]?.[col]);
      if (!format || (candidate && !sameFormat(candidate, format))) return undefined;
      candidate ??= format;
    }
    return candidate;
  });
}

function persistedBounds(
  sheet: Sheet,
  previous: TableBlockPayload,
  columnFormats: (TableCellFormat | undefined)[],
): { rows: number; cols: number } {
  let rows = Math.max(MIN_ROWS, previous.rows || MIN_ROWS);
  let cols = Math.max(MIN_COLS, previous.cols || MIN_COLS);
  columnFormats.forEach((format, col) => {
    if (format) cols = Math.max(cols, col + 1);
  });
  (sheet.data ?? []).forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
    if (!hasPersistableCellValue(cell, !columnFormats[colIndex])) return;
    rows = Math.max(rows, rowIndex + 1);
    cols = Math.max(cols, colIndex + 1);
  }));
  Object.values(sheet.config?.merge ?? {}).forEach((merge) => {
    rows = Math.max(rows, merge.r + (merge.rs ?? 1));
    cols = Math.max(cols, merge.c + (merge.cs ?? 1));
  });
  for (const [index, height] of Object.entries(sheet.config?.rowlen ?? {})) {
    if (Number.isInteger(Number(index)) && Number(index) >= 0 && height > 0) rows = Math.max(rows, Number(index) + 1);
  }
  for (const [index, width] of Object.entries(sheet.config?.columnlen ?? {})) {
    if (Number.isInteger(Number(index)) && Number(index) >= 0 && width > 0) cols = Math.max(cols, Number(index) + 1);
  }
  return { rows, cols };
}

function cellText(cell: Cell | null | undefined): string {
  const value = asText(cell?.m ?? cell?.v);
  return cell?.f && value === cell.f ? "" : value;
}

function alignFromCell(cell: Cell | null | undefined): TableCellAlignment | undefined {
  if (cell?.ht === 1) return "left";
  if (cell?.ht === 2) return "right";
  if (cell?.ht === 0) return "center";
  return undefined;
}

function applyCellMarks(content: TableCellContent, cell: Cell): TableCellContent {
  const markStyles: [keyof TableCellMarks, "bl" | "it" | "un" | "cl"][] = [["bold", "bl"], ["italic", "it"], ["underline", "un"], ["strikethrough", "cl"]];
  const blocks = content.blocks.map((block) => ({
    ...block,
    runs: block.runs.map((run) => {
      const marks = { ...(run.marks ?? {}) };
      for (const [key, styleKey] of markStyles) {
        const value = cell[styleKey];
        if (typeof value !== "number") continue;
        if (value) marks[key] = true;
        else delete marks[key];
      }
      return { ...run, marks: Object.keys(marks).length ? marks : undefined };
    }),
  }));
  return { ...content, blocks };
}

function readMerges(sheet: Sheet): NonNullable<TableBlockPayload["merges"]> {
  return Object.values(sheet.config?.merge ?? {}).map((merge) => ({
    row: merge.r,
    col: merge.c,
    rowSpan: merge.rs,
    colSpan: merge.cs,
  }));
}

function readDimensionConfig(sheet: Sheet, key: "rowlen" | "columnlen", count: number): number[] | undefined {
  const values = Array.from({ length: count }, (_, index) => sheet.config?.[key]?.[String(index)]);
  if (!values.some((value) => typeof value === "number" && value > 0)) return undefined;
  const fallback = key === "rowlen" ? 28 : 110;
  return values.map((value) => typeof value === "number" && value > 0 ? value : fallback);
}

export function fortuneSheetToTablePatch(
  sheet: Sheet,
  previous: TableBlockPayload,
): Partial<TableBlockPayload> {
  const source = sheet.data ?? [];
  const columnFormats = readColumnFormats(sheet);
  const bounds = persistedBounds(sheet, previous, columnFormats);
  const rows = bounds.rows;
  const cols = bounds.cols;
  const rowHeights = readDimensionConfig(sheet, "rowlen", rows) ?? previous.rowHeights;
  const columnWidths = readDimensionConfig(sheet, "columnlen", cols) ?? previous.columnWidths;
  const weights = (sizes: number[] | undefined) => {
    const total = sizes?.reduce((sum, value) => sum + value, 0);
    return sizes && total ? sizes.map((size) => size / total) : undefined;
  };
  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => cellText(source[row]?.[col]))
  );
  const formulas = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => normalizedFormula(source[row]?.[col]?.f))
  );
  const contents = cloneGrid(previous.cellContents, rows, cols);
  const cellBgColor = cloneGrid(previous.cellBgColor, rows, cols);
  const cellTextColor = cloneGrid(previous.cellTextColor, rows, cols);
  const cellFontSizes = cloneGrid(previous.cellFontSizes, rows, cols);
  const cellAlign = cloneGrid(previous.cellAlign, rows, cols);
  const cellValues = cloneGrid(previous.cellValues, rows, cols);
  const cellFormats = cloneGrid(previous.cellFormats, rows, cols);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = source[row]?.[col];
      const value = cells[row][col];
      const oldValue = previous.cells?.[row]?.[col] ?? "";
      const oldFormula = normalizedFormula(previous.formulas?.[row]?.[col]);
      if (value !== oldValue || formulas[row][col] !== oldFormula || !contents[row]?.[col]) {
        contents[row][col] = textTableCellContent(value);
      }
      if (cell && (cell.bl !== undefined || cell.it !== undefined || cell.un !== undefined || cell.cl !== undefined)) {
        contents[row][col] = applyCellMarks(contents[row][col] ?? textTableCellContent(value), cell);
      }
      // Assign unconditionally so clearing a style in the editor is persisted.
      cellBgColor[row][col] = cell?.bg || undefined;
      cellTextColor[row][col] = cell?.fc || undefined;
      cellFontSizes[row][col] = cell?.fs || undefined as unknown as number;
      cellAlign[row][col] = alignFromCell(cell);
      const rawValue = cell?.v as TableCellValue | undefined;
      cellValues[row][col] = rawValue !== undefined && (typeof rawValue !== "string" || rawValue !== value) ? rawValue : undefined;
      cellFormats[row][col] = columnFormats[col] ? undefined : formatFromCell(cell);
    }
  }
  return {
    ...previous,
    rows,
    cols,
    cells,
    formulas: hasGridValue(formulas) ? formulas : undefined,
    cellValues: hasGridValue(cellValues) ? cellValues : undefined,
    cellFormats: hasGridValue(cellFormats) ? cellFormats : undefined,
    columnFormats: columnFormats.some(Boolean) ? columnFormats : undefined,
    cellContents: contents,
    cellBgColor: hasGridValue(cellBgColor) ? cellBgColor : undefined,
    cellTextColor: hasGridValue(cellTextColor) ? cellTextColor : undefined,
    cellFontSizes: hasGridValue(cellFontSizes) ? cellFontSizes : undefined,
    cellAlign: hasGridValue(cellAlign) ? cellAlign : undefined,
    rowHeights,
    columnWidths,
    autoFitContent: rowHeights || columnWidths ? false : previous.autoFitContent,
    rowWeights: weights(rowHeights) ?? previous.rowWeights,
    colWeights: weights(columnWidths) ?? previous.colWeights,
    merges: readMerges(sheet),
    ...readSheetStructure(sheet, previous, rows, cols),
    mode: "spreadsheet",
  };
}
