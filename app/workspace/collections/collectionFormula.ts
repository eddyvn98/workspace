import type { CollectionBlockPayload, CollectionField, CollectionRecord } from "./model";

export const FORMULA_OPERATIONS = ["sum", "subtract", "multiply", "divide", "average", "concat"] as const;
export type FormulaOperation = typeof FORMULA_OPERATIONS[number];
export const AGGREGATE_OPERATIONS = ["sum", "average", "min", "max", "count"] as const;
export type AggregateOperation = typeof AGGREGATE_OPERATIONS[number];
export interface CollectionAggregation { fieldId: string; operation: AggregateOperation; }
export function evaluateCollectionFormula(data: CollectionBlockPayload, record: CollectionRecord,
  field: CollectionField): string {
  if (field.type !== "formula" || !field.formulaOperation) return "";
  const ids = field.formulaFieldIds ?? [];
  if (ids.length < 2 || ids.length > 10) return "";
  const sources = ids.map(id => data.fields.find(candidate => candidate.id === id && candidate.type !== "formula"));
  if (sources.some(source => !source)) return "";
  const values = ids.map(id => record.values[id] ?? "");
  if (field.formulaOperation === "concat") return values.join(" ").slice(0, 2000);
  if (values.some(value => !value.trim() || !Number.isFinite(Number(value)))) return "";
  const numbers = values.map(Number);
  let result: number;
  switch (field.formulaOperation) {
    case "sum": result = numbers.reduce((a, b) => a + b, 0); break;
    case "subtract": result = numbers[0] - numbers[1]; break;
    case "multiply": result = numbers.reduce((a, b) => a * b, 1); break;
    case "divide": result = numbers[1] === 0 ? NaN : numbers[0] / numbers[1]; break;
    case "average": result = numbers.reduce((a, b) => a + b, 0) / numbers.length; break;
    default: return "";
  }
  return Number.isFinite(result) ? String(Number(result.toFixed(6))) : "";
}
export function projectCollectionFormulas(data: CollectionBlockPayload, record: CollectionRecord): CollectionRecord {
  const formulas = data.fields.filter(field => field.type === "formula");
  if (!formulas.length) return record;
  const values = { ...record.values };
  for (const field of formulas) values[field.id] = evaluateCollectionFormula(data, { ...record, values }, field);
  return { ...record, values };
}
export function calculateCollectionAggregate(records: CollectionRecord[], item: CollectionAggregation): string {
  if (item.operation === "count") return String(records.filter(record => (record.values[item.fieldId] ?? "") !== "").length);
  const values = records.map(record => record.values[item.fieldId] ?? "")
    .filter(value => value.trim() !== "" && Number.isFinite(Number(value))).map(Number);
  if (!values.length) return "";
  const sum = values.reduce((a, b) => a + b, 0);
  const result = item.operation === "sum" ? sum : item.operation === "average" ? sum / values.length
    : item.operation === "min" ? Math.min(...values) : Math.max(...values);
  return Number.isFinite(result) ? String(Number(result.toFixed(6))) : "";
}
