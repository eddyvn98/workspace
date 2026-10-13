import { withTableCellMarks } from "./tableCellMarks";
import type { TableRange } from "./tableFormatRange";
import { refreshFormattedDisplay } from "./tableSheetNumberFormat";
import type { JsonMap } from "./operationsTables";

type Position = { row: number; column: number };

const BORDER_STYLES: Record<string, string> = { thin: "1", dotted: "3", dashed: "4", medium: "8", thick: "13" };
const BORDER_SIDES: Record<string, string> = {
  all: "border-all", outer: "border-outside", inner: "border-inside",
  top: "border-top", bottom: "border-bottom", left: "border-left", right: "border-right",
};
const VERTICAL = ["top", "middle", "bottom"];

const record = (value: unknown): JsonMap => (value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {});
const pick = (raw: JsonMap, format: JsonMap, key: string): unknown => raw[key] ?? record(raw.params)[key] ?? format[key];

function boundsOf(positions: Position[]): TableRange {
  const rows = positions.map((position) => position.row);
  const columns = positions.map((position) => position.column);
  return { row: [Math.min(...rows), Math.max(...rows)], column: [Math.min(...columns), Math.max(...columns)] };
}

function cssColor(value: unknown): string | undefined {
  return typeof value === "string" && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(value.trim()) ? value.trim() : undefined;
}

/** Appends a Fortune borderInfo entry for the formatted range. Returns false for an invalid request. */
function applyBorder(data: JsonMap, border: unknown, positions: Position[]): boolean {
  const spec = record(border);
  const styleName = String(spec.style ?? "thin").toLowerCase();
  const sides = String(spec.sides ?? "all").toLowerCase();
  const none = styleName === "none";
  if (!none && !BORDER_STYLES[styleName]) return false;
  if (!BORDER_SIDES[sides]) return false;
  const color = spec.color === undefined ? "#000000" : cssColor(spec.color);
  if (!color) return false;
  const range = boundsOf(positions);
  const entry: JsonMap = none
    ? { rangeType: "range", borderType: "border-none", style: "1", color, range: [range] }
    : { rangeType: "range", borderType: BORDER_SIDES[sides], style: BORDER_STYLES[styleName], color, range: [range] };
  data.borderInfo = [...(Array.isArray(data.borderInfo) ? data.borderInfo : []), entry];
  return true;
}

function setKeyed(data: JsonMap, field: string, positions: Position[], value: unknown): void {
  const next = { ...record(data[field]) };
  for (const { row, column } of positions) {
    if (value === undefined) delete next[`${row}_${column}`];
    else next[`${row}_${column}`] = value;
  }
  if (Object.keys(next).length) data[field] = next;
  else delete data[field];
}

/** Sheet-only cell style fields of update_table_cell_format: border, wrap, verticalAlign,
 *  strikethrough, fontFamily, plus a display refresh when a number format is set. */
export function applySheetCellStyle(raw: JsonMap, data: JsonMap, positions: Position[], format: JsonMap): boolean {
  let changed = false;
  const border = pick(raw, format, "border");
  if (border !== undefined && applyBorder(data, border, positions)) changed = true;
  const wrap = pick(raw, format, "wrap");
  if (typeof wrap === "boolean") { setKeyed(data, "cellWrap", positions, wrap ? true : undefined); changed = true; }
  const vertical = pick(raw, format, "verticalAlign");
  if (typeof vertical === "string" && VERTICAL.includes(vertical)) { setKeyed(data, "cellVerticalAlign", positions, vertical === "middle" ? undefined : vertical); changed = true; }
  const font = pick(raw, format, "fontFamily");
  if (typeof font === "string" && /^[\w \-'",]{1,60}$/.test(font)) { setKeyed(data, "cellFont", positions, font.trim()); changed = true; }
  const strike = pick(raw, format, "strikethrough");
  if (typeof strike === "boolean") {
    const contents = Array.isArray(data.cellContents) ? data.cellContents as unknown[][] : [];
    for (const { row, column } of positions) {
      contents[row] = Array.isArray(contents[row]) ? contents[row] : [];
      contents[row][column] = withTableCellMarks(contents[row][column], String((data.cells as string[][])[row][column]), { strikethrough: strike });
    }
    data.cellContents = contents;
    changed = true;
  }
  if (typeof format.fa === "string" && format.fa.trim()) {
    // The spreadsheet editor renders the stored display text; document tables format at render time and keep the raw value.
    if (data.mode === "spreadsheet") refreshFormattedDisplay(data, positions);
    changed = true;
  }
  return changed;
}
