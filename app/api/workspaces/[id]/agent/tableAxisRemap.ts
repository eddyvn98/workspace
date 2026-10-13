import type { JsonMap } from "./operationsTables";

type Axis = "row" | "col";
type Pair = [number, number];
type Json = Record<string, unknown>;

export type RemapOptions = {
  /** old index -> new index along the axis (identity for untouched lines). */
  map: (index: number) => number;
  /** Per-cell structures move only when the cell is affected (a sort limits this to its rectangle). */
  cellApplies?: (row: number, col: number) => boolean;
  /** False for a partial-width sort: whole-line structures cannot follow a partial row move. */
  wholeLines?: boolean;
};

const isRecord = (value: unknown): value is Json => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const KEYED = ["cellLinks", "cellNotes", "cellWrap", "cellVerticalAlign", "cellFont", "dataValidations"];

/** Contiguous runs covered by the images of every line of an inclusive span. */
export function mapSpan([start, end]: Pair, map: (index: number) => number): Pair[] {
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return [];
  if (end - start > 20000) return [[Math.min(map(start), map(end)), Math.max(map(start), map(end))]];
  const images: number[] = [];
  for (let index = start; index <= end; index += 1) images.push(map(index));
  images.sort((a, b) => a - b);
  const runs: Pair[] = [];
  for (const image of images) {
    const last = runs[runs.length - 1];
    if (last && image <= last[1] + 1) last[1] = Math.max(last[1], image); else runs.push([image, image]);
  }
  return runs;
}

function remapKeyed(source: unknown, axis: Axis, options: RemapOptions): Json | undefined {
  if (!isRecord(source)) return undefined;
  const next: Json = {};
  for (const [key, value] of Object.entries(source)) {
    const parts = key.split("_");
    const [row, col] = parts.map(Number);
    if (parts.length !== 2 || !Number.isInteger(row) || !Number.isInteger(col) || options.cellApplies?.(row, col) === false) { next[key] = value; continue; }
    next[axis === "row" ? `${options.map(row)}_${col}` : `${row}_${options.map(col)}`] = value;
  }
  return Object.keys(next).length ? next : undefined;
}

function remapRanges(list: unknown, axis: Axis, map: (index: number) => number): Json[] {
  const field = axis === "row" ? "row" : "column";
  return (Array.isArray(list) ? list : []).flatMap((range): Json[] => {
    if (!isRecord(range) || !Array.isArray(range[field])) return [range as Json];
    return mapSpan(range[field] as Pair, map).map((span) => ({ ...range, [field]: span }));
  });
}

function remapBorders(borders: unknown, axis: Axis, options: RemapOptions): unknown {
  if (!Array.isArray(borders)) return undefined;
  const indexField = axis === "row" ? "row_index" : "col_index";
  return borders.flatMap((entry): unknown[] => {
    if (!isRecord(entry)) return [entry];
    if (entry.rangeType === "cell" && isRecord(entry.value)) {
      const row = Number(entry.value.row_index);
      const col = Number(entry.value.col_index);
      if (!Number.isInteger(row) || !Number.isInteger(col) || options.cellApplies?.(row, col) === false) return [entry];
      return [{ ...entry, value: { ...entry.value, [indexField]: options.map(Number(entry.value[indexField])) } }];
    }
    if (!options.wholeLines) return [entry];
    const range = remapRanges(entry.range, axis, options.map);
    return range.length ? [{ ...entry, range }] : [];
  });
}

function remapRules(rules: unknown, axis: Axis, map: (index: number) => number): unknown {
  if (!Array.isArray(rules)) return undefined;
  return rules.map((rule) => (isRecord(rule) ? {
    ...rule,
    cellrange: remapRanges(rule.cellrange, axis, map),
    ...(Array.isArray(rule.conditionRange) ? { conditionRange: remapRanges(rule.conditionRange, axis, map) } : {}),
  } : rule));
}

function remapFilter(filter: Json, axis: Axis, map: (index: number) => number): Json {
  const spans = isRecord(filter.range) ? remapRanges([filter.range], axis, map) : [];
  const hull = spans.length ? spans.reduce((all, span) => {
    const field = axis === "row" ? "row" : "column";
    const [a, b] = span[field] as Pair;
    const [c, d] = all[field] as Pair;
    return { ...all, [field]: [Math.min(a, c), Math.max(b, d)] };
  }) : filter.range;
  const filters = isRecord(filter.filters) ? Object.fromEntries(Object.entries(filter.filters).map(([key, item]) => {
    if (!isRecord(item)) return [key, item];
    if (axis === "col") return [String(map(Number(key))), { ...item, cindex: map(Number(key)) }];
    const hidden = isRecord(item.rowhidden) ? Object.fromEntries(Object.entries(item.rowhidden).map(([row, flag]) => [String(map(Number(row))), flag])) : item.rowhidden;
    const span = Number.isFinite(Number(item.str)) && Number.isFinite(Number(item.edr)) ? mapSpan([Number(item.str), Number(item.edr)], map) : [];
    return [key, { ...item, rowhidden: hidden, ...(span.length ? { str: span[0][0], edr: span[span.length - 1][1] } : {}) }];
  })) : filter.filters;
  const criteria = axis === "col" && isRecord(filter.criteria) && typeof filter.criteria.column === "number"
    ? { ...filter.criteria, column: map(filter.criteria.column) } : filter.criteria;
  return { ...filter, range: hull, ...(filters !== undefined ? { filters } : {}), ...(criteria !== undefined ? { criteria } : {}) };
}

/** Moves every per-cell and per-line spreadsheet structure through an index map
 * (a row/column move or a sort permutation). Returns receipt notes. */
export function remapSheetStructures(data: JsonMap, axis: Axis, options: RemapOptions): string[] {
  const notes: string[] = [];
  const { map } = options;
  for (const key of KEYED) {
    if (data[key] === undefined) continue;
    const next = remapKeyed(data[key], axis, options);
    if (next) data[key] = next; else delete data[key];
  }
  if (data.borderInfo !== undefined) data.borderInfo = remapBorders(data.borderInfo, axis, options);
  const wholeStructures = Boolean((Array.isArray(data.hiddenRows) && data.hiddenRows.length && axis === "row") || data.autoFilter || (Array.isArray(data.conditionalFormats) && data.conditionalFormats.length)
    || (Array.isArray(data.borderInfo) && data.borderInfo.some((entry) => isRecord(entry) && entry.rangeType !== "cell")));
  if (!options.wholeLines) {
    if (wholeStructures) notes.push("Hidden rows, range borders, conditional formats and the filter range were left in place because the sort does not cover whole rows.");
    return notes;
  }
  const hiddenKey = axis === "row" ? "hiddenRows" : "hiddenCols";
  if (Array.isArray(data[hiddenKey])) data[hiddenKey] = (data[hiddenKey] as number[]).map((index) => map(Number(index))).sort((a, b) => a - b);
  if (data.conditionalFormats !== undefined) data.conditionalFormats = remapRules(data.conditionalFormats, axis, map);
  if (isRecord(data.autoFilter)) data.autoFilter = remapFilter(data.autoFilter, axis, map);
  const frozen = data.frozen;
  if (isRecord(frozen) && typeof frozen[axis === "row" ? "row" : "col"] === "number") {
    const last = frozen[axis === "row" ? "row" : "col"] as number;
    if (Array.from({ length: last + 1 }, (_, index) => index).some((index) => map(index) !== index)) {
      notes.push("The frozen pane boundary was left unchanged; the frozen lines now hold different data.");
    }
  }
  return notes;
}
