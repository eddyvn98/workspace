import type { BlockDataMap, TableCellAlign, TableCellAttachment } from "../types/block";
import type { TableCellContent, TableCellFormat, TableCellValue, TableColumnOption, TableColumnType, TableFilterSpec, TableMode, TableSortSpec } from "../types/table";

export type TableBlockData = BlockDataMap["table"];

function emptyCellContent(): TableCellContent {
  return { version: 1, blocks: [{ type: "paragraph", runs: [{ text: "" }] }] };
}

function textCellContent(text: string): TableCellContent {
  return { version: 1, blocks: text.split("\n").map((line) => ({ type: "paragraph", runs: [{ text: line }] })) };
}

function isCellContent(value: unknown): value is TableCellContent {
  return Boolean(value && typeof value === "object" && (value as TableCellContent).version === 1 && Array.isArray((value as TableCellContent).blocks));
}

export type TableMerge = { row: number; col: number; rowSpan: number; colSpan: number };

export function normalizeTableData(data?: Partial<TableBlockData>): {
  rows: number;
  cols: number;
  cells: string[][];
  mode?: TableMode;
  formulas?: (string | undefined)[][];
  cellValues?: (TableCellValue | undefined)[][];
  cellFormats?: (TableCellFormat | undefined)[][];
  columnFormats?: (TableCellFormat | undefined)[];
  cellContents?: TableCellContent[][];
  rowWeights?: number[];
  rowHeights?: number[];
  columnWidths?: number[];
  colWeights?: number[];
  cellFontSizes?: number[][];
  cellAlign?: (TableCellAlign | undefined)[][];
  cellBgColor?: (string | undefined)[][];
  cellTextColor?: (string | undefined)[][];
  merges?: TableMerge[];
  cellItems?: Record<string, TableCellAttachment[]>;
  columnTypes?: TableColumnType[];
  columnSelectOptions?: Record<number, TableColumnOption[]>;
  sortCol?: TableSortSpec | null;
  filterCol?: TableFilterSpec | null;
} {
  const rows = typeof data?.rows === "number" && data.rows > 0 ? data.rows : 2;
  const cols = typeof data?.cols === "number" && data.cols > 0 ? data.cols : 2;
  const cells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => data?.cells?.[r]?.[c] ?? "")
  );
  const result: ReturnType<typeof normalizeTableData> = { rows, cols, cells };
  if (data?.mode === "document" || data?.mode === "spreadsheet") result.mode = data.mode;
  if (Array.isArray(data?.formulas)) {
    result.formulas = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const value = data.formulas?.[r]?.[c];
        return typeof value === "string" && value.trim().startsWith("=") ? value : undefined;
      })
    );
  }
  if (Array.isArray(data?.cellValues)) result.cellValues = data.cellValues.map((row) => Array.isArray(row) ? [...row] : []);
  if (Array.isArray(data?.cellFormats)) result.cellFormats = data.cellFormats.map((row) => Array.isArray(row) ? row.map((value) => value ? { ...value } : undefined) : []);
  if (Array.isArray(data?.columnFormats)) result.columnFormats = data.columnFormats.map((value) => value ? { ...value } : undefined);
  if (Array.isArray(data?.cellContents)) {
    result.cellContents = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        const value = data.cellContents?.[r]?.[c];
        return isCellContent(value) ? value : textCellContent(cells[r][c]);
      })
    );
  }
  if (Array.isArray(data?.rowHeights)) result.rowHeights = [...data.rowHeights];
  if (Array.isArray(data?.columnWidths)) result.columnWidths = [...data.columnWidths];
  if (Array.isArray(data?.rowWeights)) result.rowWeights = data.rowWeights.length === rows ? [...data.rowWeights] : Array(rows).fill(1);
  if (Array.isArray(data?.colWeights)) result.colWeights = data.colWeights.length === cols ? [...data.colWeights] : Array(cols).fill(1);
  if (Array.isArray(data?.cellFontSizes)) result.cellFontSizes = data.cellFontSizes.map((row) => Array.isArray(row) ? [...row] : []);
  if (Array.isArray(data?.cellAlign)) result.cellAlign = data.cellAlign.map((row) => Array.isArray(row) ? [...row] : []);
  if (Array.isArray(data?.cellBgColor)) result.cellBgColor = data.cellBgColor.map((row) => Array.isArray(row) ? [...row] : []);
  if (Array.isArray(data?.cellTextColor)) result.cellTextColor = data.cellTextColor.map((row) => Array.isArray(row) ? [...row] : []);
  if (Array.isArray(data?.merges)) result.merges = data.merges.map((m) => ({ ...m }));
  if (Array.isArray(data?.columnTypes)) result.columnTypes = [...data.columnTypes];
  if (data?.columnSelectOptions && typeof data.columnSelectOptions === "object") {
    result.columnSelectOptions = Object.fromEntries(
      Object.entries(data.columnSelectOptions).map(([key, opts]) => [key, opts.map((o) => ({ ...o }))])
    );
  }
  if (data?.sortCol !== undefined) result.sortCol = data.sortCol ? { ...data.sortCol } : data.sortCol;
  if (data?.filterCol !== undefined) result.filterCol = data.filterCol ? { ...data.filterCol } : data.filterCol;
  if (data?.cellItems && typeof data.cellItems === "object") {
    result.cellItems = Object.fromEntries(
      Object.entries(data.cellItems).map(([key, attachments]) => [
        key,
        Array.isArray(attachments)
          ? attachments.map((attachment) => ({ ...attachment }))
          : [],
      ])
    );
  }
  return result;
}

export { emptyCellContent };
