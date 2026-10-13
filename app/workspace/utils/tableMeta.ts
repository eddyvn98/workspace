import { cellAddress } from "./tableFormula";

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const MAX_FORMULAS = 30;

function anyCell(grid: unknown): boolean {
  return Array.isArray(grid) && grid.some((row) => Array.isArray(row) && row.some((item) => item !== null && item !== undefined && item !== ""));
}

/** Compact, model-facing description of a table's structure: everything the
 * plain `cells` grid hides (mode, header flags, column types and select options,
 * merges, active sort/filter, formulas, colours, formats). Empty facts are omitted. */
export function buildTableMeta(data: Json): Json {
  const meta: Json = { mode: data.mode === "spreadsheet" ? "spreadsheet" : "document" };
  meta.headerRow = Boolean(data.headerRow);
  if (data.headerCol) meta.headerCol = true;
  const types = Array.isArray(data.columnTypes) ? data.columnTypes : [];
  const optionStore = isRecord(data.columnSelectOptions) ? data.columnSelectOptions : {};
  const columns = types.flatMap((type, col) => {
    if (!type || type === "text") return [];
    const options = Array.isArray(optionStore[col]) ? (optionStore[col] as Json[]).map((option) => ({ id: option.id, label: option.label })) : [];
    return [{ col, type, ...(options.length ? { options } : {}) }];
  });
  if (columns.length) meta.columnTypes = columns;
  if (Array.isArray(data.merges) && data.merges.length) meta.mergeCount = data.merges.length;
  if (isRecord(data.sortCol)) meta.sortCol = { col: data.sortCol.col, dir: data.sortCol.dir };
  if (isRecord(data.filterCol)) meta.filterCol = { col: data.filterCol.col, optionId: data.filterCol.optionId };
  if (Array.isArray(data.formulas)) {
    const formulas: Record<string, string> = {};
    let total = 0;
    data.formulas.forEach((row, r) => Array.isArray(row) && row.forEach((formula, c) => {
      if (typeof formula !== "string" || !formula.startsWith("=")) return;
      total += 1;
      if (total <= MAX_FORMULAS) formulas[cellAddress(r, c)] = formula;
    }));
    if (total) { meta.formulas = formulas; if (total > MAX_FORMULAS) meta.formulaCount = total; }
  }
  if (anyCell(data.cellBgColor) || anyCell(data.cellTextColor)) meta.hasColours = true;
  if (anyCell(data.cellFormats)) meta.hasNumberFormats = true;
  if (isRecord(data.cellItems) && Object.keys(data.cellItems).length) meta.attachmentCells = Object.keys(data.cellItems).length;
  return meta;
}
