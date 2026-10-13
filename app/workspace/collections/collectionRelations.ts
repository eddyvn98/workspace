import type { CollectionBlockPayload, CollectionField, CollectionRecord } from "./model";

/** Lookups are read-only live values, never duplicated in persisted record cells. */
export function getCollectionValue(data: CollectionBlockPayload, record: CollectionRecord,
  field: CollectionField): string {
  if (field.type !== "lookup") return record.values[field.id] ?? "";
  // Resolve the canonical field by stable ID; callers may hold a pre-update field snapshot.
  const current = data.fields.find(item => item.id === field.id && item.type === "lookup");
  const relation = data.fields.find(item => item.id === current?.relationFieldId && item.type === "relation");
  const source = data.fields.find(item => item.id === current?.targetFieldId && item.type !== "lookup");
  if (!relation || !source) return "";
  const linkedId = record.values[relation.id];
  const target = data.records.find(item => item.id === linkedId);
  return target?.values[source.id] ?? "";
}
export function projectCollectionLookups(data: CollectionBlockPayload, record: CollectionRecord): CollectionRecord {
  const lookups = data.fields.filter(field => field.type === "lookup");
  if (!lookups.length) return record;
  const values = { ...record.values };
  for (const field of lookups) values[field.id] = getCollectionValue(data, record, field);
  return { ...record, values };
}
export function removeInboundRelations(data: CollectionBlockPayload, deletedId: string): CollectionRecord[] {
  const relationIds = data.fields.filter(field => field.type === "relation").map(field => field.id);
  return data.records.filter(record => record.id !== deletedId).map(record => {
    const targets = relationIds.filter(id => record.values[id] === deletedId);
    const values = targets.length ? { ...record.values } : record.values;
    for (const id of targets) values[id] = "";
    return { ...record, values, parentId: record.parentId === deletedId ? null : record.parentId };
  });
}
