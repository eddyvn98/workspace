"use client";
import React from "react";
import type { CollectionBlockPayload, CollectionField, CollectionSources } from "../collections/model";
import { recordTitle } from "../collections/model";
import { relationIds, encodeRelationIds } from "../collections/collectionRelations";
export const inputClass = "rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
export const btnClass = "rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-40";
export function FieldEditor({ field, value, onSet, readOnly, data, recordId, sources }: {
  field: CollectionField; value: string; onSet: (value: string) => void;
  readOnly: boolean; data?: CollectionBlockPayload; recordId?: string; sources?: CollectionSources;
}) {
  if (field.type === "lookup" || field.type === "formula" || field.type === "rollup") return <output aria-label={field.name}
    className="block min-w-20 truncate rounded bg-slate-100 p-1 text-xs dark:bg-slate-800" title={value}>{value}</output>;
  if (field.type === "relation") {
    const target = field.relationTargetBlockId ? sources?.[field.relationTargetBlockId] : data;
    const options = target?.records.filter(record => field.relationTargetBlockId || record.id !== recordId) ?? [];
    if (field.relationMultiple) return <select aria-label={field.name} className={inputClass + " min-h-24"}
      multiple value={relationIds(value)} disabled={readOnly || !data}
      onChange={event => onSet(encodeRelationIds(Array.from(event.currentTarget.selectedOptions, option => option.value), true))}>
      {options.map(record => <option key={record.id} value={record.id}>{recordTitle(target!, record)}</option>)}
    </select>;
    return <select aria-label={field.name} className={inputClass}
      value={value} disabled={readOnly || !data} onChange={event => onSet(event.target.value)}>
      <option value="">Unlinked</option>
      {options.map(record => <option key={record.id} value={record.id}>{recordTitle(target!, record)}</option>)}
    </select>;
  }
  if (field.type === "checkbox") return <input aria-label={field.name} type="checkbox"
    checked={value === "true"} disabled={readOnly} onChange={event => onSet(String(event.target.checked))} />;
  if (field.type === "select") return <select aria-label={field.name} className={inputClass}
    value={value} disabled={readOnly} onChange={event => onSet(event.target.value)}>
    <option value="">Unassigned</option>
    {(field.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
  </select>;
  return <input aria-label={field.name} className={inputClass + " w-full min-w-20"}
    value={value} type={field.type === "date" ? "date" : field.type === "number" ? "number" :
      field.type === "url" ? "url" : "text"} disabled={readOnly} onChange={event => onSet(event.target.value)} />;
}
