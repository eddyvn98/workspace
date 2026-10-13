import type { TableRange } from "./tableFormatRange";
import type { JsonMap } from "./operationsTables";

const record = (value: unknown): JsonMap => (value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {});
const field = (raw: JsonMap, key: string): unknown => raw[key] ?? record(raw.params)[key];

const RULES: Record<string, string> = {
  gt: "greaterThan", lt: "lessThan", equal: "equal", text_contains: "textContains", between: "between", duplicate: "duplicateValue",
};
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
// Fortune interpolates colour scales from "rgb(r, g, b)" strings: [max, mid, min].
const COLOR_SCALE = ["rgb(99, 190, 123)", "rgb(255, 235, 132)", "rgb(248, 105, 107)"];

function overlaps(rule: unknown, range: TableRange): boolean {
  const ranges = Array.isArray(record(rule).cellrange) ? record(rule).cellrange as Array<{ row: number[]; column: number[] }> : [];
  return ranges.some((item) => item.row[0] <= range.row[1] && item.row[1] >= range.row[0] && item.column[0] <= range.column[1] && item.column[1] >= range.column[0]);
}

/** add_table_conditional_format: appends a Fortune rule, or removes rules touching the range (clear:true). */
export function applyConditionalFormat(raw: JsonMap, data: JsonMap, range: TableRange | null): boolean {
  if (!range) return false;
  const rules = Array.isArray(data.conditionalFormats) ? data.conditionalFormats as unknown[] : [];
  if (field(raw, "clear") === true) {
    const kept = rules.filter((rule) => !overlaps(rule, range));
    if (kept.length === rules.length) return false;
    if (kept.length) data.conditionalFormats = kept; else delete data.conditionalFormats;
    return true;
  }
  const rule = String(field(raw, "rule") ?? "").toLowerCase();
  const cellrange = [{ row: [...range.row], column: [...range.column] }];
  if (rule === "colorscale") {
    data.conditionalFormats = [...rules, { type: "colorGradation", cellrange, format: COLOR_SCALE }];
    return true;
  }
  const conditionName = RULES[rule];
  if (!conditionName) return false;
  const values = Array.isArray(field(raw, "values")) ? field(raw, "values") as unknown[] : [];
  const first = field(raw, "value") ?? field(raw, "value1") ?? values[0];
  const second = field(raw, "value2") ?? values[1];
  const needed = rule === "duplicate" ? 0 : rule === "between" ? 2 : 1;
  const given = [first, second].slice(0, needed).map((item) => (typeof item === "number" || typeof item === "string" ? String(item) : ""));
  if (given.length < needed || given.some((item) => item === "")) return false;
  if (["gt", "lt", "between"].includes(rule) && given.some((item) => !Number.isFinite(Number(item)))) return false;
  const backgroundColor = field(raw, "backgroundColor") ?? field(raw, "bgColor");
  const textColor = field(raw, "textColor");
  if ([backgroundColor, textColor].some((color) => color !== undefined && (typeof color !== "string" || !COLOR.test(color.trim())))) return false;
  const cellColor = typeof backgroundColor === "string" ? backgroundColor.trim() : textColor === undefined ? "#fde68a" : null;
  data.conditionalFormats = [...rules, {
    type: "default", cellrange, conditionName, conditionRange: [],
    conditionValue: rule === "duplicate" ? ["0"] : given,
    format: { textColor: typeof textColor === "string" ? textColor.trim() : null, cellColor },
  }];
  return true;
}
