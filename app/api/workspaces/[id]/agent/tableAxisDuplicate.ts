import type { JsonMap } from "./operationsTables";

type Axis = "row" | "col";
type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const KEYED = ["cellLinks", "cellNotes", "cellWrap", "cellVerticalAlign", "cellFont", "dataValidations"];

/** Extends an inclusive span that ended right before the new slot so it covers the duplicate. */
function growSpan(span: unknown, source: number, slot: number): unknown {
  if (!Array.isArray(span) || span.length !== 2) return span;
  const [start, end] = span as [number, number];
  return start <= source && end === slot - 1 ? [start, slot] : span;
}

function growRanges(list: unknown, field: string, source: number, slot: number): unknown {
  return Array.isArray(list) ? list.map((range) => (isRecord(range) ? { ...range, [field]: growSpan(range[field], source, slot) } : range)) : list;
}

/** After a line was inserted at `slot`, copies the source line's per-cell structures
 * (links, notes, validations, borders, wrap, font) into it and extends ranges that
 * ended at the source (borders, conditional formats, filter, hidden lines). */
export function duplicateStructuresIntoSlot(data: JsonMap, axis: Axis, source: number, slot: number): void {
  for (const key of KEYED) {
    if (!isRecord(data[key])) continue;
    const next: Json = { ...data[key] as Json };
    for (const [position, value] of Object.entries(data[key] as Json)) {
      const [row, col] = position.split("_").map(Number);
      if ((axis === "row" ? row : col) !== source) continue;
      next[axis === "row" ? `${slot}_${col}` : `${row}_${slot}`] = structuredClone(value);
    }
    data[key] = next;
  }
  const field = axis === "row" ? "row" : "column";
  if (Array.isArray(data.borderInfo)) {
    const indexField = axis === "row" ? "row_index" : "col_index";
    data.borderInfo = (data.borderInfo as unknown[]).flatMap((entry): unknown[] => {
      if (!isRecord(entry)) return [entry];
      if (entry.rangeType === "cell" && isRecord(entry.value)) {
        return Number(entry.value[indexField]) === source ? [entry, { ...entry, value: { ...entry.value, [indexField]: slot } }] : [entry];
      }
      return [{ ...entry, range: growRanges(entry.range, field, source, slot) }];
    });
  }
  if (Array.isArray(data.conditionalFormats)) {
    data.conditionalFormats = (data.conditionalFormats as unknown[]).map((rule) => (isRecord(rule) ? {
      ...rule,
      cellrange: growRanges(rule.cellrange, field, source, slot),
      ...(Array.isArray(rule.conditionRange) ? { conditionRange: growRanges(rule.conditionRange, field, source, slot) } : {}),
    } : rule));
  }
  if (isRecord(data.autoFilter) && isRecord(data.autoFilter.range)) {
    data.autoFilter = { ...data.autoFilter, range: { ...data.autoFilter.range, [field]: growSpan(data.autoFilter.range[field], source, slot) } };
  }
  const hiddenKey = axis === "row" ? "hiddenRows" : "hiddenCols";
  if (Array.isArray(data[hiddenKey]) && (data[hiddenKey] as number[]).includes(source)) {
    data[hiddenKey] = [...new Set([...(data[hiddenKey] as number[]), slot])].sort((a, b) => a - b);
  }
  const span = axis === "row" ? "rowSpan" : "colSpan";
  if (Array.isArray(data.merges)) {
    const copies = (data.merges as Array<Record<string, number>>).filter((merge) => merge[axis] === source && (merge[span] ?? 1) === 1)
      .map((merge) => ({ ...merge, [axis]: slot }));
    data.merges = [...data.merges as unknown[], ...copies];
  }
}
