"use client";
import React from "react";
import type { CollectionBlockPayload, CollectionField, CollectionRecord } from "../collections/model";
import { recordTitle } from "../collections/model";
import { FieldEditor } from "./CollectionFieldEditor";
const dayMs = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const parseDay = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T12:00:00Z") : null;
const asDay = (date: string) => { const parsed = parseDay(date); return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null; };
export function TimelineView({ rows, data, start, end, readOnly, patch }: { rows: CollectionRecord[]; data: CollectionBlockPayload; start?: CollectionField; end?: CollectionField; readOnly: boolean; patch: (r: CollectionRecord, f: CollectionField, v: string) => void }) {
  const dated = rows.map((r) => ({ record: r, start: asDay(r.values[start?.id ?? ""] || ""), end: asDay(r.values[end?.id ?? ""] || "") })).filter((v) => v.start);
  const min = dated.length ? Math.min(...dated.map((v) => v.start!.getTime())) : Date.now();
  const max = dated.length ? Math.max(...dated.map((v) => (v.end ?? v.start)!.getTime()), min + 7 * dayMs) : min + 7 * dayMs;
  const span = Math.max(dayMs, max - min + dayMs);
  return <div className="min-w-[500px] space-y-2 text-xs">{!start && <p className="text-amber-600">Add a date field for timeline.</p>}{dated.map((v) => <div key={v.record.id} className="grid grid-cols-[130px_1fr] items-center gap-2"><span className="truncate" title={recordTitle(data, v.record)}>{recordTitle(data, v.record)}</span><div className="relative h-7 rounded bg-slate-100 dark:bg-slate-800"><div className="absolute top-1 h-5 min-w-2 rounded bg-blue-500" style={{ left: ((v.start!.getTime() - min) / span * 100) + "%", width: (Math.max(dayMs, (v.end ?? v.start)!.getTime() - v.start!.getTime() + dayMs) / span * 100) + "%" }} /></div></div>)}<div className="flex gap-2">{start && <span>Start: {iso(new Date(min))}</span>}<span>End: {iso(new Date(max))}</span></div>{dated.map((v) => <div key={v.record.id + "-edit"} className="flex flex-wrap items-center gap-2 border-t py-1"><span className="w-32 truncate">{recordTitle(data, v.record)}</span>{start && <FieldEditor field={start} value={v.record.values[start.id] || ""} onSet={(x) => patch(v.record, start, x)} readOnly={readOnly} />}{end && <FieldEditor field={end} value={v.record.values[end.id] || ""} onSet={(x) => patch(v.record, end, x)} readOnly={readOnly} />}</div>)}</div>;
}