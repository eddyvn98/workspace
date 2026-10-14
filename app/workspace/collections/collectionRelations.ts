import type { CollectionBlockPayload, CollectionField, CollectionRecord } from "./model";

/** Legacy single ID and JSON arrays share one stable persisted relation field. */
export function relationIds(value: string | undefined): string[] {
  if (!value) return [];
  if (!value.startsWith("[")) return [value];
  try {
    const raw: unknown = JSON.parse(value);
    return Array.isArray(raw) && raw.length <= 100 &&
      raw.every(item => typeof item === "string" && item.length <= 128)
      ? [...new Set(raw)] : [];
  } catch { return []; }
}
export function encodeRelationIds(ids: string[], multiple: boolean): string {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 100);
  return multiple ? JSON.stringify(unique) : (unique[0] ?? "");
}
export function relationValueValid(data: CollectionBlockPayload, field: CollectionField, value: string): boolean {
  if (!value || (field.relationMultiple && value === "[]")) return true;
  if (!field.relationMultiple && value.startsWith("[")) return false;
  const ids = relationIds(value);
  return ids.length > 0 && (field.relationMultiple || ids.length === 1)
    && ids.every(id => data.records.some(record => record.id === id));
}
function relatedValues(data: CollectionBlockPayload, record: CollectionRecord, field: CollectionField): string[] {
  const relation = data.fields.find(item => item.id === field.relationFieldId && item.type === "relation");
  const source = data.fields.find(item => item.id === field.targetFieldId &&
    !["lookup", "rollup", "formula", "relation"].includes(item.type));
  if (!relation) return [];
  const ids = new Set(relationIds(record.values[relation.id]));
  const linked = data.records.filter(item => ids.has(item.id));
  if (field.type === "rollup" && field.rollupOperation === "count") return linked.map(() => "1");
  if (!source) return [];
  return linked.map(item => item.values[source.id] ?? "").filter(Boolean);
}
export function getCollectionValue(data: CollectionBlockPayload, record: CollectionRecord,
  field: CollectionField): string {
  if (field.type !== "lookup" && field.type !== "rollup") return record.values[field.id] ?? "";
  const current = data.fields.find(item => item.id === field.id &&
    (item.type === "lookup" || item.type === "rollup"));
  if (!current) return "";
  const values = relatedValues(data, record, current);
  if (current.type === "lookup") return values.join(", ").slice(0, 2000);
  const operation = current.rollupOperation ?? "count";
  if (operation === "count") return String(values.length);
  const numbers = values.filter(value => value.trim() && Number.isFinite(Number(value))).map(Number);
  if (!numbers.length) return "";
  const sum = numbers.reduce((a, b) => a + b, 0);
  const result = operation === "sum" ? sum : operation === "average" ? sum / numbers.length
    : operation === "min" ? Math.min(...numbers) : Math.max(...numbers);
  return Number.isFinite(result) ? String(Number(result.toFixed(6))) : "";
}
export function projectCollectionLookups(data: CollectionBlockPayload, record: CollectionRecord): CollectionRecord {
  const computed = data.fields.filter(field => field.type === "lookup" || field.type === "rollup");
  if (!computed.length) return record;
  const values = { ...record.values };
  for (const field of computed) values[field.id] = getCollectionValue(data, record, field);
  return { ...record, values };
}
export function removeInboundRelations(data: CollectionBlockPayload, deletedId: string): CollectionRecord[] {
  const relations = data.fields.filter(field => field.type === "relation");
  return data.records.filter(record => record.id !== deletedId).map(record => {
    const values = { ...record.values };
    for (const field of relations) {
      const ids = relationIds(values[field.id]);
      if (ids.includes(deletedId)) values[field.id] = encodeRelationIds(ids.filter(id => id !== deletedId),
        !!field.relationMultiple);
    }
    return { ...record, values, parentId: record.parentId === deletedId ? null : record.parentId };
  });
}
