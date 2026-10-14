import type { CollectionBlockPayload } from "./model";
import { encodeRelationIds, relationIds } from "./collectionRelations";
import { appendCollectionAudit } from "./collectionAudit";

interface BlockLike { type?: unknown; data?: unknown; updatedAt?: number }
const collection = (value: unknown): value is CollectionBlockPayload =>
  !!value && typeof value === "object" && !Array.isArray(value) &&
  Array.isArray((value as CollectionBlockPayload).fields) &&
  Array.isArray((value as CollectionBlockPayload).records) &&
  Array.isArray((value as CollectionBlockPayload).views);

export function deletedCollectionIds(before: unknown, after: unknown): Set<string> {
  if (!collection(before) || !collection(after)) return new Set();
  const remaining = new Set(after.records.map(item => item.id));
  return new Set(before.records.filter(item => !remaining.has(item.id)).map(item => item.id));
}

/** Prune foreign IDs in one board transaction, including multi-link values. */
export function pruneDeletedCollectionLinks<T extends BlockLike>(
  blocks: Record<string, T>, ownerId: string, deleted: ReadonlySet<string>, actor = "System",
): { blocks: Record<string, T>; changedBlockIds: string[] } {
  if (!deleted.size) return { blocks, changedBlockIds: [] };
  let next = blocks;
  const changedBlockIds: string[] = [];
  for (const [id, block] of Object.entries(blocks)) {
    if (id === ownerId || block.type !== "collection" || !collection(block.data)) continue;
    const data = block.data;
    const fields = data.fields.filter(field => field.type === "relation" && field.relationTargetBlockId === ownerId);
    if (!fields.length) continue;
    let modified = false;
    const records = data.records.map(record => {
      let values: typeof record.values | undefined;
      for (const field of fields) {
        const links = relationIds(record.values[field.id]);
        if (!links.some(link => deleted.has(link))) continue;
        values ??= { ...record.values };
        values[field.id] = encodeRelationIds(links.filter(link => !deleted.has(link)), !!field.relationMultiple);
      }
      if (!values) return record;
      modified = true;
      return { ...record, values };
    });
    if (!modified) continue;
    if (next === blocks) next = { ...blocks };
    next[id] = { ...block, data: appendCollectionAudit(data, { ...data, records }, actor),
      updatedAt: Date.now() } as T;
    changedBlockIds.push(id);
  }
  return { blocks: next, changedBlockIds };
}

/** Entire target block deleted: clear values and invalid computed target bindings. */
export function unbindDeletedCollection<T extends BlockLike>(blocks: Record<string, T>, ownerId: string,
  actor = "System"): Record<string, T> {
  let next = blocks;
  for (const [id, block] of Object.entries(blocks)) {
    if (id === ownerId || block.type !== "collection" || !collection(block.data)) continue;
    const data = block.data;
    const targets = data.fields.filter(field => field.type === "relation" && field.relationTargetBlockId === ownerId);
    if (!targets.length) continue;
    const keys = new Set(targets.map(field => field.id));
    const fields = data.fields.map(field => keys.has(field.id)
      ? { ...field, relationTargetBlockId: undefined }
      : field.relationFieldId && keys.has(field.relationFieldId)
        ? { ...field, targetFieldId: undefined } : field);
    const records = data.records.map(record => {
      const values = { ...record.values };
      for (const key of keys) values[key] = "";
      return { ...record, values };
    });
    if (next === blocks) next = { ...blocks };
    next[id] = { ...block, data: appendCollectionAudit(data, { ...data, fields, records }, actor),
      updatedAt: Date.now() } as T;
  }
  return next;
}
