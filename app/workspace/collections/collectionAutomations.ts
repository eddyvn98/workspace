import type { CollectionBlockPayload, CollectionField, CollectionRecord } from "./model";

export interface CollectionAutomation {
  id: string;
  name: string;
  enabled: boolean;
  whenFieldId: string;
  whenEquals: string;
  thenFieldId: string;
  thenValue: string;
}
export const automationWritable = (field: CollectionField | undefined): field is CollectionField =>
  !!field && !["lookup", "formula", "rollup", "relation"].includes(field.type);
export function validAutomationTarget(field: CollectionField, value: string): boolean {
  if (value.length > 2000) return false;
  if (field.type === "checkbox") return ["true", "false"].includes(value);
  if (field.type === "select") return (field.options ?? []).includes(value);
  if (field.type === "number") return value === "" || (value.trim() !== "" && Number.isFinite(Number(value)));
  if (field.type === "date") return value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);
  return true;
}
/** One event, one pass; rule outputs never trigger rules and cannot loop. */
export function applyCollectionAutomations(data: CollectionBlockPayload,
  previous: CollectionRecord | null, record: CollectionRecord,
  changedFieldIds: string[]): CollectionRecord {
  if (!data.automations?.length || !changedFieldIds.length) return record;
  const changed = new Set(changedFieldIds), values = { ...record.values };
  for (const rule of data.automations.slice(0, 20)) {
    if (!rule.enabled || !changed.has(rule.whenFieldId) || rule.whenFieldId === rule.thenFieldId) continue;
    const trigger = data.fields.find(f => f.id === rule.whenFieldId);
    const target = data.fields.find(f => f.id === rule.thenFieldId);
    if (!trigger || !automationWritable(target) || !validAutomationTarget(target, rule.thenValue)) continue;
    if ((previous?.values[rule.whenFieldId] ?? "") === rule.whenEquals) continue;
    if ((record.values[rule.whenFieldId] ?? "") !== rule.whenEquals) continue;
    values[rule.thenFieldId] = rule.thenValue;
  }
  return { ...record, values };
}
export function sanitizeCollectionAutomations(data: CollectionBlockPayload): CollectionAutomation[] {
  const valid = new Set(data.fields.map(field => field.id));
  return (data.automations ?? []).filter(rule => rule && typeof rule.id === "string" &&
    valid.has(rule.whenFieldId) && valid.has(rule.thenFieldId) &&
    rule.whenFieldId !== rule.thenFieldId).slice(0, 20);
}
