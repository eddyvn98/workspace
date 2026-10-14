import type { CollectionBlockPayload, CollectionSources } from "./model";
import { encodeRelationIds, relationIds } from "./collectionRelations";

export interface DanglingRelation {
  recordId: string;
  fieldId: string;
  missingIds: string[];
}
export function diagnoseCollectionRelations(data: CollectionBlockPayload,
  sources: CollectionSources = {}): DanglingRelation[] {
  const relations = data.fields.filter(field => field.type === "relation");
  const validIds = new Map(relations.map(field => [
    field.id, new Set((field.relationTargetBlockId ? sources[field.relationTargetBlockId] : data)
      ?.records.map(row => row.id) ?? []),
  ]));
  const problems: DanglingRelation[] = [];
  for (const row of data.records) for (const field of relations) {
    const missingIds = relationIds(row.values[field.id]).filter(id => !validIds.get(field.id)?.has(id));
    if (missingIds.length) problems.push({ recordId: row.id, fieldId: field.id, missingIds });
  }
  return problems;
}
/** Only removes invalid IDs after an explicit user repair action. */
export function repairCollectionRelations(data: CollectionBlockPayload,
  sources: CollectionSources = {}): CollectionBlockPayload {
  const problems = diagnoseCollectionRelations(data, sources);
  if (!problems.length) return data;
  const missing = new Map<string, Set<string>>();
  for (const problem of problems) missing.set(problem.recordId + ":" + problem.fieldId,
    new Set(problem.missingIds));
  return { ...data, records: data.records.map(row => {
    let values: typeof row.values | undefined;
    for (const field of data.fields) {
      if (field.type !== "relation") continue;
      const bad = missing.get(row.id + ":" + field.id);
      if (!bad) continue;
      values ??= { ...row.values };
      values[field.id] = encodeRelationIds(relationIds(row.values[field.id])
        .filter(id => !bad.has(id)), !!field.relationMultiple);
    }
    return values ? { ...row, values } : row;
  }) };
}
