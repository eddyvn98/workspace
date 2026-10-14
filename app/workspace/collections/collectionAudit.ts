import type { CollectionBlockPayload, CollectionRecord } from "./model";
import { newId, recordTitle } from "./model";

export interface CollectionAuditChange {
  fieldId: string;
  before?: string;
  after?: string;
}
export interface CollectionAuditEntry {
  id: string;
  at: number;
  actor: string;
  kind: "create" | "update" | "delete";
  recordId: string;
  title: string;
  changes: CollectionAuditChange[];
}
export const MAX_COLLECTION_AUDIT = 120;
const cell = (value: string | null | undefined) => (value ?? "").slice(0, 200);
const map = (rows: CollectionRecord[]) => new Map(rows.map(row => [row.id, row]));

function rowChanges(before: CollectionRecord | undefined, after: CollectionRecord | undefined): CollectionAuditChange[] {
  const oldValues = before?.values ?? {}, newValues = after?.values ?? {};
  const changes: CollectionAuditChange[] = [];
  for (const fieldId of new Set([...Object.keys(oldValues), ...Object.keys(newValues)])) {
    if ((oldValues[fieldId] ?? "") === (newValues[fieldId] ?? "")) continue;
    changes.push({ fieldId,
      before: cell(oldValues[fieldId]), after: cell(newValues[fieldId]) });
    if (changes.length >= 15) break;
  }
  if ((before?.parentId ?? null) !== (after?.parentId ?? null)) {
    changes.push({ fieldId: "$parent", before: cell(before?.parentId), after: cell(after?.parentId) });
  }
  return changes;
}

/** Write a bounded, board-owned record audit. Editing text is coalesced to avoid logging every keystroke. */
export function appendCollectionAudit(before: CollectionBlockPayload, after: CollectionBlockPayload,
  actor = "Editor"): CollectionBlockPayload {
  const oldRows = map(before.records), newRows = map(after.records);
  const prior = Array.isArray(after.auditTrail) ? after.auditTrail.slice(0, MAX_COLLECTION_AUDIT) :
    (before.auditTrail ?? []).slice(0, MAX_COLLECTION_AUDIT);
  const at = Date.now();
  const updatedActor = actor.trim().slice(0, 160) || "Editor";
  let entries = prior;
  for (const id of new Set([...oldRows.keys(), ...newRows.keys()])) {
    const oldRow = oldRows.get(id), newRow = newRows.get(id);
    const changes = rowChanges(oldRow, newRow);
    if (oldRow && newRow && !changes.length) continue;
    const kind = !oldRow ? "create" : !newRow ? "delete" : "update";
    const entry: CollectionAuditEntry = {
      id: newId(), at, actor: updatedActor, kind, recordId: id,
      title: recordTitle(newRow ? after : before, (newRow ?? oldRow)! ).slice(0, 160),
      changes,
    };
    const newest = entries[0];
    const coalesce = kind === "update" && changes.length === 1 && newest?.kind === "update" &&
      newest.actor === entry.actor && newest.recordId === id && newest.changes.length === 1 &&
      newest.changes[0].fieldId === changes[0].fieldId && at - newest.at >= 0 && at - newest.at < 30_000;
    if (coalesce) {
      entries = [{ ...newest, at, title: entry.title,
        changes: [{ ...changes[0], before: newest.changes[0].before }] }, ...entries.slice(1)];
    } else entries = [entry, ...entries].slice(0, MAX_COLLECTION_AUDIT);
  }
  return entries === prior ? after : { ...after, auditTrail: entries };
}
