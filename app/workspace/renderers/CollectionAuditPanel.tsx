"use client";
import React from "react";
import type { CollectionBlockPayload } from "../collections/model";
import { MAX_COLLECTION_AUDIT } from "../collections/collectionAudit";

interface Props { data: CollectionBlockPayload; onClose: () => void }
const label = (data: CollectionBlockPayload, fieldId: string) =>
  fieldId === "$parent" ? "Parent" : fieldId === "$body" ? "Record notes" :
    data.fields.find(field => field.id === fieldId)?.name ?? "Removed field";

export function CollectionAuditPanel({ data, onClose }: Props) {
  const history = (data.auditTrail ?? []).filter(entry => entry && typeof entry.id === "string" &&
    typeof entry.at === "number" && Number.isFinite(entry.at) &&
    Array.isArray(entry.changes)).slice(0, MAX_COLLECTION_AUDIT);
  return <section className="max-h-64 shrink-0 overflow-y-auto border-b bg-slate-50 p-2 text-xs dark:bg-slate-900"
    aria-label="Collection record history" data-testid="collection-record-history">
    <div className="mb-2 flex items-center justify-between gap-2">
      <strong>Record change history · {history.length}</strong>
      <button type="button" className="rounded border px-2 py-1" onClick={onClose}>Close history</button>
    </div>
    {!history.length && <p className="text-slate-500">No recorded changes yet.</p>}
    {history.map(entry => <article key={entry.id} className="mb-2 rounded border bg-white p-2 dark:bg-slate-950">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{entry.kind.toUpperCase()} · {entry.title}</strong>
        <time dateTime={new Date(entry.at).toISOString()} className="text-slate-500">
          {new Date(entry.at).toLocaleString()}
        </time>
        <span className="text-slate-500">{entry.actor}</span>
      </div>
      {entry.changes.map(change => <div key={change.fieldId} className="mt-1 break-words">
        {label(data, change.fieldId)}:
        <span className="mx-1 text-slate-500">{change.before || "(empty)"}</span>→
        <span className="ml-1">{change.after || "(empty)"}</span>
      </div>)}
    </article>)}
  </section>;
}
