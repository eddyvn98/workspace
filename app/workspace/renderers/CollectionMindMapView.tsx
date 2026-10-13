"use client";
import React from "react";
import type { CollectionBlockPayload, CollectionRecord } from "../collections/model";
import { recordTitle, setParent } from "../collections/model";
import { inputClass } from "./CollectionFieldEditor";
export function MindMapView({ rows, data, readOnly, onChange }: { rows: CollectionRecord[]; data: CollectionBlockPayload; readOnly: boolean; onChange: (next: CollectionBlockPayload) => void }) {
  const ids = new Set(rows.map((r) => r.id));
  const children = new Map<string | null, CollectionRecord[]>();
  rows.forEach((r) => { const parent = r.parentId && ids.has(r.parentId) ? r.parentId : null; children.set(parent, [...(children.get(parent) ?? []), r]); });
  const render = (parent: string | null, depth: number, ancestors: Set<string>): React.ReactNode => depth > 40 ? null : (children.get(parent) ?? []).filter((r) => !ancestors.has(r.id)).map((r) => <div key={r.id} className="ml-3 border-l-2 border-slate-200 pl-3 dark:border-slate-700"><div className="my-1 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 dark:border-slate-700 dark:bg-slate-900"><strong className="min-w-24 text-xs">{recordTitle(data, r)}</strong><select aria-label={"Parent of " + recordTitle(data, r)} className={inputClass} disabled={readOnly} value={r.parentId && ids.has(r.parentId) ? r.parentId : ""} onChange={(e) => onChange(setParent(data, r.id, e.target.value || null))}><option value="">Root</option>{rows.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{recordTitle(data, x)}</option>)}</select></div>{render(r.id, depth + 1, new Set([...ancestors, r.id]))}</div>);
  return <div className="space-y-2"><p className="text-xs text-slate-500">Hierarchy uses record parent relationships. Edit record titles in Table view.</p>{render(null, 0, new Set())}</div>;
}