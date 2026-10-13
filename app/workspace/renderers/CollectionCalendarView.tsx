"use client";
import React from "react";
import type { CollectionBlockPayload, CollectionField, CollectionRecord } from "../collections/model";
import { recordTitle } from "../collections/model";
import { btnClass } from "./CollectionFieldEditor";
const iso = (date: Date) => date.toISOString().slice(0, 10);
export function CalendarView({ month, setMonth, rows, data, field, readOnly, patch }: { month: string; setMonth: (value: string) => void; rows: CollectionRecord[]; data: CollectionBlockPayload; field?: CollectionField; readOnly: boolean; patch: (r: CollectionRecord, f: CollectionField, v: string) => void }) {
  const [year, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, m, 0, 12)).getUTCDate();
  const days = Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, i) => i - offset + 1);
  const shift = (n: number) => { const d = new Date(Date.UTC(year, m - 1 + n, 1)); setMonth(iso(d).slice(0, 7)); };
  return <div className="space-y-2"><div className="flex items-center gap-2"><button className={btnClass} onClick={() => shift(-1)}>←</button><strong>{month}</strong><button className={btnClass} onClick={() => shift(1)}>→</button>{!field && <span className="text-xs text-amber-600">Add a date field to use calendar</span>}</div><div className="grid grid-cols-7 gap-1 text-xs">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((x) => <strong key={x} className="text-center">{x}</strong>)}{days.map((day, i) => { const dateText = year + "-" + String(m).padStart(2, "0") + "-" + String(day).padStart(2, "0"); const matches = rows.filter((r) => field && r.values[field.id] === dateText); return <div key={i} className={"min-h-16 rounded border p-1 dark:border-slate-700 " + (day < 1 || day > length ? "opacity-25" : "")} onDragOver={(e) => { if (!readOnly) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/collection-record"); const record = rows.find((r) => r.id === id); if (record && field && day >= 1 && day <= length) patch(record, field, dateText); }}><span className="text-slate-500">{day >= 1 && day <= length ? day : ""}</span>{matches.map((r) => <div key={r.id} draggable={!readOnly} onDragStart={(e) => e.dataTransfer.setData("text/collection-record", r.id)} className="mt-1 truncate rounded bg-blue-100 p-1 text-blue-900" title={recordTitle(data, r)}>{recordTitle(data, r)}</div>)}</div>; })}</div><div className="text-xs text-slate-500">Drag events to reschedule. Records without a date are available in Table view.</div></div>;
}