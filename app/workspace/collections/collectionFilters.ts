import type { CollectionField, CollectionRecord } from "./model";

export const FILTER_OPERATORS = ["eq", "neq", "contains", "not_contains", "gt", "gte", "lt", "lte", "empty", "not_empty"] as const;
export type FilterOperator = typeof FILTER_OPERATORS[number];
export interface CollectionFilter { fieldId: string; value: string; operator?: FilterOperator; }
export type FilterLogic = "and" | "or";
export const isUnaryFilter = (op: FilterOperator) => op === "empty" || op === "not_empty";
export const isRangeFilter = (op: FilterOperator) => ["gt", "gte", "lt", "lte"].includes(op);
export const validOperator = (value: unknown): value is FilterOperator =>
  typeof value === "string" && FILTER_OPERATORS.some(op => op === value);

export function isValidFilterOperator(type: CollectionField["type"], op: FilterOperator): boolean {
  if (isRangeFilter(op)) return type === "number" || type === "date";
  if (op === "contains" || op === "not_contains") return ["text", "select", "url", "image"].includes(type);
  return true;
}
export function matchesFilter(record: CollectionRecord, field: CollectionField | undefined, filter: CollectionFilter): boolean {
  if (!field) return false;
  const operator = filter.operator ?? "eq";
  if (!validOperator(operator) || !isValidFilterOperator(field.type, operator)) return false;
  const left = record.values[filter.fieldId] ?? "";
  const right = filter.value;
  if (operator === "empty") return !left;
  if (operator === "not_empty") return !!left;
  if (!right.trim()) return true; // Draft row, not yet applied.
  if (operator === "eq") return left === right;
  if (operator === "neq") return left !== right;
  if (operator === "contains") return left.toLocaleLowerCase().includes(right.toLocaleLowerCase());
  if (operator === "not_contains") return !left.toLocaleLowerCase().includes(right.toLocaleLowerCase());
  if (!left) return false;
  const compare = field.type === "number"
    ? (Number.isFinite(Number(left)) && Number.isFinite(Number(right)) ? Number(left) - Number(right) : NaN)
    : left.localeCompare(right);
  if (Number.isNaN(compare)) return false;
  if (operator === "gt") return compare > 0;
  if (operator === "gte") return compare >= 0;
  if (operator === "lt") return compare < 0;
  return compare <= 0;
}
export function matchesViewFilters(record: CollectionRecord, fields: CollectionField[],
  filters: CollectionFilter[], logic: FilterLogic = "and"): boolean {
  const active = filters.filter(f => isUnaryFilter(f.operator ?? "eq") || !!f.value.trim());
  if (!active.length) return true;
  const fieldsById = new Map(fields.map(field => [field.id, field]));
  return logic === "or"
    ? active.some(filter => matchesFilter(record, fieldsById.get(filter.fieldId), filter))
    : active.every(filter => matchesFilter(record, fieldsById.get(filter.fieldId), filter));
}
