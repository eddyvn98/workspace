"use client";
import React from "react";
import type { CollectionField } from "../collections/model";
export const inputClass = "rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
export const btnClass = "rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-40";
export function FieldEditor({ field, value, onSet, readOnly }: { field: CollectionField; value: string; onSet: (value: string) => void; readOnly: boolean }) {
  if (field.type === "checkbox") return <input aria-label={field.name} type="checkbox" checked={value === "true"} disabled={readOnly} onChange={(e) => onSet(String(e.target.checked))} />;
  if (field.type === "select") return <select aria-label={field.name} className={inputClass} value={value} disabled={readOnly} onChange={(e) => onSet(e.target.value)}><option value="">Unassigned</option>{(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  return <input aria-label={field.name} className={inputClass + " w-full min-w-20"} value={value} type={field.type === "date" ? "date" : field.type === "number" ? "number" : field.type === "url" ? "url" : "text"} disabled={readOnly} onChange={(e) => onSet(e.target.value)} />;
}
