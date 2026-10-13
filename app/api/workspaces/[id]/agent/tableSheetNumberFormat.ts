import { genarate, update } from "@fortune-sheet/core";
import { isTableCellContent } from "@/app/workspace/components/table/tableCellContent";
import type { JsonMap } from "./operationsTables";

type Position = { row: number; column: number };

const isRecord = (value: unknown): value is JsonMap => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Parses typed text the way the spreadsheet editor does ("12%" -> 0.12, ISO date -> serial). */
function parseTyped(text: string): { value: number; type: string } | null {
  const parsed = text.trim() ? genarate(text.trim()) : null;
  const value = parsed?.[2];
  const type = parsed?.[1]?.t;
  return typeof value === "number" && Number.isFinite(value) && (type === "n" || type === "d") ? { value, type } : null;
}

export function formatCellDisplay(value: number, fa: string): string {
  try {
    const text = update(fa, value);
    return typeof text === "string" && !text.includes("NaN") ? text : String(value);
  } catch {
    return String(value);
  }
}

function formatTypeFor(fa: string): string {
  if (fa === "@") return "s";
  return /[ymdhs]/i.test(fa.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "")) ? "d" : "n";
}

/** Replaces the visible text of rich cell content while keeping the first run's marks. */
function retextContent(content: unknown, text: string): void {
  if (!isTableCellContent(content) || !content.blocks.length) return;
  const [first] = content.blocks;
  content.blocks = [{ ...first, runs: [{ ...(first.runs[0] ?? {}), text }] }];
}

function ensureGrid(data: JsonMap, field: string): unknown[][] {
  const rows = Number(data.rows);
  const cols = Number(data.cols);
  const source = Array.isArray(data[field]) ? data[field] as unknown[] : [];
  const grid = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => (Array.isArray(source[row]) ? (source[row] as unknown[])[col] ?? null : null)));
  data[field] = grid;
  return grid;
}

const PLAIN_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** Stores numeric text as numbers in cellValues (spreadsheet mode) so number formats can apply. */
export function storeNumericValues(data: JsonMap, updates: Array<Position & { text: string }>): void {
  if (data.mode !== "spreadsheet") return;
  const formats = data.cellFormats as unknown[][] | undefined;
  const columnFormats = Array.isArray(data.columnFormats) ? data.columnFormats : [];
  const numeric = updates.flatMap(({ row, column, text }) => {
    const format = formats?.[row]?.[column] ?? columnFormats[column];
    const fa = isRecord(format) && typeof format.fa === "string" ? format.fa : undefined;
    const value = PLAIN_NUMBER.test(text.trim()) && text.replace(/\D/g, "").length <= 15 ? Number(text) : fa ? parseTyped(text)?.value : undefined;
    return value === undefined ? [] : [{ row, column, value, fa }];
  });
  if (!numeric.length) return;
  const values = ensureGrid(data, "cellValues");
  for (const { row, column, value, fa } of numeric) {
    values[row][column] = value;
    if (fa) (data.cells as string[][])[row][column] = formatCellDisplay(value, fa);
  }
}

/** Re-renders the stored display text of cells whose number format was just set or changed. */
export function refreshFormattedDisplay(data: JsonMap, positions: Position[]): void {
  const formats = data.cellFormats as unknown[][] | undefined;
  const columnFormats = Array.isArray(data.columnFormats) ? data.columnFormats : [];
  const cells = data.cells as string[][];
  const formulas = data.formulas as unknown[][] | undefined;
  const values = ensureGrid(data, "cellValues");
  const contents = Array.isArray(data.cellContents) ? data.cellContents as unknown[][] : undefined;
  for (const { row, column } of positions) {
    const format = formats?.[row]?.[column] ?? columnFormats[column];
    if (!isRecord(format) || typeof format.fa !== "string") continue;
    const stored = values[row][column];
    const typed = typeof stored === "number" ? { value: stored, type: "n" } : parseTyped(String(cells[row][column] ?? ""));
    if (!typed) continue;
    const hasFormula = Boolean(formulas?.[row]?.[column]);
    if (!hasFormula) values[row][column] = typed.value;
    const text = formatCellDisplay(typed.value, format.fa);
    cells[row][column] = text;
    retextContent(contents?.[row]?.[column], text);
    if (typeof format.t !== "string" && formats?.[row]?.[column] === format) formats[row][column] = { ...format, t: formatTypeFor(format.fa) };
  }
  if (!values.some((line) => line.some((item) => item !== null))) delete data.cellValues;
}
