import { textTableCellContent } from "@/app/workspace/components/table/tableCellContent";
import { parseTableImportText, type TableImportFormat } from "@/app/workspace/utils/tableImportParsers";
import { pasteRangeIntoTable, parseClipboardGrid } from "@/app/workspace/utils/tablePasteOps";
import type { TableBlockData } from "@/app/workspace/utils/tableData";
import { retextCellContent, selectValue } from "./tableCellEdit";
import { syncCellValues } from "./tableGridShift";
import { addNote, field, intField, isFormula } from "./tableOpsShared";
import type { JsonMap } from "./operationsTables";

const MAX_CELLS = 20000;
const MAX_ROWS = 2000;
const MAX_COLS = 100;

function sizeOk(grid: string[][]): boolean {
  const cols = Math.max(0, ...grid.map((row) => row.length));
  return grid.length > 0 && cols > 0 && grid.length <= MAX_ROWS && cols <= MAX_COLS && grid.length * cols <= MAX_CELLS;
}

/** Grid from `values` (string[][]) or from `text` (TSV). */
export function pasteGrid(raw: JsonMap): string[][] | null {
  const values = field(raw, "values");
  const grid = Array.isArray(values) ? values.map((row) => (Array.isArray(row) ? row : [row]).map((item) => (item === null || item === undefined ? "" : String(item))))
    : typeof field(raw, "text") === "string" ? parseClipboardGrid(field(raw, "text") as string) : null;
  return grid && sizeOk(grid) ? grid : null;
}

/** Grid for import_table from csv / tsv / markdown text. */
export function importGrid(raw: JsonMap): string[][] | null {
  const text = field(raw, "text") ?? field(raw, "content") ?? field(raw, "data");
  const format = String(field(raw, "format") ?? "csv").toLowerCase();
  if (typeof text !== "string" || !["csv", "tsv", "markdown"].includes(format)) return null;
  const grid = parseTableImportText(format as TableImportFormat, text);
  return sizeOk(grid) ? grid : null;
}

function averageWeight(list: unknown): number {
  const numbers = (Array.isArray(list) ? list : []).map(Number).filter((item) => item > 0);
  return numbers.length ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length : 1;
}

/** Writes a grid at (row, column), growing the table. Marks of overwritten cells
 * are kept when uniform; select labels become option ids. */
export function pasteIntoData(raw: JsonMap, data: JsonMap, startRow: number, startColumn: number, input: string[][]): boolean {
  if (startRow < 0 || startColumn < 0 || startRow > 5000 || startColumn > 200) return false;
  const nextRows = Math.max(Number(data.rows), startRow + input.length);
  const nextCols = Math.max(Number(data.cols), startColumn + Math.max(0, ...input.map((row) => row.length)));
  if (nextRows > MAX_ROWS || nextCols > MAX_COLS || nextRows * nextCols > MAX_CELLS) {
    addNote(raw, `Refused: the result would be ${nextRows} rows x ${nextCols} columns; the limit is ${MAX_ROWS} rows x ${MAX_COLS} columns and ${MAX_CELLS} cells.`);
    return false;
  }
  const grid = input.map((row) => row.map((item, index) => selectValue(data, startColumn + index, item)));
  const before = data as unknown as TableBlockData;
  const patch = pasteRangeIntoTable(before, startRow, startColumn, grid) as unknown as JsonMap;
  const next: JsonMap = { ...data, ...patch };
  const spreadsheet = data.mode === "spreadsheet";
  if (!patch.formulas) delete next.formulas;
  for (const [key, count] of [["rowWeights", Number(patch.rows) - Number(data.rows)], ["colWeights", Number(patch.cols) - Number(data.cols)]] as const) {
    if (Array.isArray(data[key]) && count > 0) {
      const filler = averageWeight(data[key]);
      next[key] = [...(data[key] as number[]), ...Array<number>(count).fill(filler)];
    }
  }
  const plain: Array<{ row: number; column: number; text: string }> = [];
  grid.forEach((row, rowOffset) => row.forEach((item, columnOffset) => {
    if (!(spreadsheet && isFormula(item))) plain.push({ row: startRow + rowOffset, column: startColumn + columnOffset, text: item });
  }));
  syncCellValues(next, plain);
  const previous = data.cellContents as unknown[][] | undefined;
  const contents = next.cellContents as unknown[][];
  grid.forEach((row, rowOffset) => row.forEach((item, columnOffset) => {
    const r = startRow + rowOffset;
    const c = startColumn + columnOffset;
    const old = previous?.[r]?.[c];
    contents[r][c] = old && !(spreadsheet && isFormula(item)) ? retextCellContent(old, item) : textTableCellContent(item);
  }));
  Object.assign(data, next);
  addNote(raw, `Pasted ${grid.length}x${Math.max(...grid.map((row) => row.length))} values at row ${startRow}, column ${startColumn}; table is now ${data.rows} rows x ${data.cols} columns.`);
  return true;
}

export function pasteTableRange(raw: JsonMap, data: JsonMap): boolean {
  const grid = pasteGrid(raw);
  return grid !== null && pasteIntoData(raw, data, intField(raw, "row") ?? 0, intField(raw, "column") ?? intField(raw, "col") ?? 0, grid);
}

/** import_table on an existing table: replaces the content (or appends rows). */
export function importIntoTable(raw: JsonMap, data: JsonMap): boolean {
  const grid = importGrid(raw);
  if (!grid) return false;
  if (field(raw, "append") === true) return pasteIntoData(raw, data, Number(data.rows), 0, grid);
  const keep = { mode: data.mode, headerRow: data.headerRow, headerCol: data.headerCol };
  for (const key of Object.keys(data)) delete data[key];
  Object.assign(data, { rows: 1, cols: 1, cells: [[""]], ...Object.fromEntries(Object.entries(keep).filter(([, item]) => item !== undefined)) });
  if (typeof field(raw, "headerRow") === "boolean") data.headerRow = field(raw, "headerRow");
  const ok = pasteIntoData(raw, data, 0, 0, grid);
  if (ok) addNote(raw, "import_table replaced the whole table content; per-cell formatting, merges, column types and weights were reset (mode and header flags kept).");
  return ok;
}
