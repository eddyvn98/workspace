"use client";

import React, { useMemo, useRef, useState } from "react";
import type { CollectionBlockPayload, CollectionField, CollectionRecord, CollectionView } from "../collections/model";
import { addField, addRecord, addView, dateField, deleteRecord, endDateField, FIELD_TYPES, newId, primaryField, recordTitle, removeField, removeView, selectField, setParent, setRecordValue, updateField, updateView, VIEW_KINDS, visibleRecords } from "../collections/model";
import { downloadCollection, exportCollectionCsv, importCollectionCsv, importCollectionJson } from "../collections/io";

interface Props { data: CollectionBlockPayload; onChange: (next: CollectionBlockPayload) => void; readOnly: boolean }
const inputClass = "rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const btnClass = "rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-40";
const dayMs = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const parseDay = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T12:00:00Z") : null;
const asDay = (date: string) => { const parsed = parseDay(date); return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null; };

function FieldEditor({ field, value, onSet, readOnly }: { field: CollectionField; value: string; onSet: (value: string) => void; readOnly: boolean }) {
  if (field.type === "checkbox") return <input aria-label={field.name} type="checkbox" checked={value === "true"} disabled={readOnly} onChange={(e) => onSet(String(e.target.checked))} />;
  if (field.type === "select") return <select aria-label={field.name} className={inputClass} value={value} disabled={readOnly} onChange={(e) => onSet(e.target.value)}><option value="">Unassigned</option>{(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  return <input aria-label={field.name} className={inputClass + " w-full min-w-20"} value={value} type={field.type === "date" ? "date" : field.type === "number" ? "number" : field.type === "url" ? "url" : "text"} disabled={readOnly} onChange={(e) => onSet(e.target.value)} />;
}

export function CollectionSurface({ data, onChange, readOnly }: Props) {
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState(false);
  const [full, setFull] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const fileInput = useRef<HTMLInputElement>(null);
  const view = data.views.find((v) => v.id === data.activeViewId) ?? data.views[0];
  const rows = useMemo(() => visibleRecords(data, view, search), [data, view, search]);
  const titleField = primaryField(data);
  const group = selectField(data, view);
  const date = dateField(data, view);
  const end = endDateField(data, view);
  const patch = (record: CollectionRecord, field: CollectionField, value: string) => onChange(setRecordValue(data, record.id, field.id, value));
  const renameView = (change: Partial<CollectionView>) => onChange(updateView(data, view.id, change));
  const options = group?.options ?? [];
  const groupOptions = [...options, ...new Set(rows.map((r) => r.values[group?.id ?? ""] || "").filter((o) => o && !options.includes(o)))];
  const openImport = () => fileInput.current?.click();
  const loadFile = async (file?: File) => {
    if (!file || readOnly) return;
    try {
      const text = await file.text();
      const next = file.name.toLowerCase().endsWith(".json") ? importCollectionJson(text) : importCollectionCsv(text);
      if (window.confirm("Replace this collection with imported records?")) onChange(next);
    } catch (error) { window.alert(error instanceof Error ? error.message : "Import failed"); }
  };
  return <div className={"flex h-full w-full flex-col overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 " + (full ? "fixed inset-0 z-[9999] p-6" : "")}
    onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 p-2 dark:border-slate-700">
      <input aria-label="Collection title" className="min-w-24 flex-1 bg-transparent text-sm font-semibold outline-none" value={data.title} disabled={readOnly} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      <span className="text-xs text-slate-400">{data.records.length} records</span>
      <button className={btnClass} onClick={() => setFull(!full)}>{full ? "Exit full screen" : "Expand"}</button>
      <button className={btnClass} onClick={() => setSettings(!settings)}>Settings</button>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-200 p-2 dark:border-slate-700">
      {data.views.map((v) => <button key={v.id} className={btnClass + (v.id === view.id ? " border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900" : "")} onClick={() => onChange({ ...data, activeViewId: v.id })}>{v.name}</button>)}
      {!readOnly && <select aria-label="Add view" className={inputClass} value="" onChange={(e) => e.target.value && onChange(addView(data, e.target.value as CollectionView["kind"]))}><option value="">+ View</option>{VIEW_KINDS.map((v) => <option key={v} value={v}>{v}</option>)}</select>}
      <input aria-label="Search records" className={inputClass + " ml-auto w-32"} placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
    </div>
    {settings && <div className="max-h-52 shrink-0 space-y-2 overflow-auto border-b bg-slate-50 p-2 text-xs dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2"><label>View name <input className={inputClass} value={view.name} disabled={readOnly} onChange={(e) => renameView({ name: e.target.value })} /></label>
        <label>Sort <select className={inputClass} value={view.sort?.fieldId ?? ""} disabled={readOnly} onChange={(e) => renameView({ sort: e.target.value ? { fieldId: e.target.value, direction: "asc" } : undefined })}><option value="">None</option>{data.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        {view.sort && <select className={inputClass} value={view.sort.direction} disabled={readOnly} onChange={(e) => renameView({ sort: { ...view.sort!, direction: e.target.value as "asc" | "desc" } })}><option value="asc">Ascending</option><option value="desc">Descending</option></select>}
        <button className={btnClass} disabled={readOnly || data.views.length <= 1} onClick={() => onChange(removeView(data, view.id))}>Delete view</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label>Filter <select className={inputClass} value={view.filter?.fieldId ?? ""} disabled={readOnly} onChange={(e) => renameView({ filter: e.target.value ? { fieldId: e.target.value, value: "" } : undefined })}><option value="">None</option>{data.fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        {view.filter && <input className={inputClass} value={view.filter.value} disabled={readOnly} placeholder="Exact value" onChange={(e) => renameView({ filter: { ...view.filter!, value: e.target.value } })} />}
        {view.kind === "kanban" && <label>Group <select className={inputClass} value={group?.id ?? ""} disabled={readOnly} onChange={(e) => renameView({ groupFieldId: e.target.value })}>{data.fields.filter((f) => f.type === "select").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
        {(view.kind === "calendar" || view.kind === "timeline") && <><label>Date <select className={inputClass} value={date?.id ?? ""} disabled={readOnly} onChange={(e) => renameView({ dateFieldId: e.target.value })}>{data.fields.filter((f) => f.type === "date").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>End <select className={inputClass} value={end?.id ?? ""} disabled={readOnly} onChange={(e) => renameView({ endDateFieldId: e.target.value })}>{data.fields.filter((f) => f.type === "date").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label></>}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {data.fields.map((f) => <span key={f.id} className="flex items-center gap-1 rounded border p-1"><input aria-label={"Rename " + f.name} className="w-20 bg-transparent" value={f.name} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { name: e.target.value }))} /><select aria-label={"Type " + f.name} className={inputClass} value={f.type} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { type: e.target.value as CollectionField["type"] }))}>{FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>{f.type === "select" && <input aria-label={"Options " + f.name} className={inputClass + " w-36"} value={(f.options ?? []).join(", ")} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { options: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) }))}/>}<button disabled={readOnly || f.id === data.fields[0].id} onClick={() => onChange(removeField(data, f.id))}>×</button></span>)}
        <button className={btnClass} disabled={readOnly} onClick={() => onChange(addField(data, "Field " + (data.fields.length + 1), "text"))}>+ Field</button>
      </div>
    </div>}
    <div className="min-h-0 flex-1 overflow-auto p-2">
      {view.kind === "table" && <table className="w-full border-collapse text-left text-xs"><thead><tr>{data.fields.map((f) => <th className="sticky top-0 whitespace-nowrap border-b bg-slate-100 p-2 dark:bg-slate-800" key={f.id}>{f.name}</th>)}<th className="border-b"> </th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}>{data.fields.map((f) => <td className="min-w-28 border-b p-1" key={f.id}><FieldEditor field={f} value={r.values[f.id] ?? ""} readOnly={readOnly} onSet={(v) => patch(r, f, v)} /></td>)}<td><button aria-label={"Delete " + recordTitle(data, r)} className={btnClass} disabled={readOnly} onClick={() => onChange(deleteRecord(data, r.id))}>×</button></td></tr>)}</tbody></table>}
      {view.kind === "kanban" && <div className="flex h-full min-w-max gap-3">{["", ...groupOptions].map((status) => <div key={status} className="w-52 shrink-0 rounded-lg bg-slate-100 p-2 dark:bg-slate-900" onDragOver={(e) => { if (!readOnly) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/collection-record"); if (group && data.records.some((r) => r.id === id)) onChange(setRecordValue(data, id, group.id, status)); }}><div className="mb-2 text-xs font-semibold">{status || "Unassigned"} · {rows.filter((r) => (r.values[group?.id ?? ""] ?? "") === status).length}</div>{rows.filter((r) => (r.values[group?.id ?? ""] ?? "") === status).map((r) => <div key={r.id} draggable={!readOnly} onDragStart={(e) => e.dataTransfer.setData("text/collection-record", r.id)} className="mb-2 rounded border bg-white p-2 text-xs shadow-sm dark:bg-slate-800"><div className="mb-2 font-semibold">{recordTitle(data, r)}</div>{titleField && <FieldEditor field={titleField} value={r.values[titleField.id] ?? ""} readOnly={readOnly} onSet={(v) => patch(r, titleField, v)} />}{group && <select className={inputClass + " mt-1 w-full"} disabled={readOnly} value={r.values[group.id] ?? ""} onChange={(e) => patch(r, group, e.target.value)}><option value="">Unassigned</option>{groupOptions.map((o) => <option key={o}>{o}</option>)}</select>}</div>)}<button className={btnClass} disabled={readOnly} onClick={() => onChange(addRecord(data, group ? { [group.id]: status } : {}))}>+ Card</button></div>)}</div>}
      {view.kind === "gallery" && <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{rows.map((r) => <div key={r.id} className="overflow-hidden rounded-lg border dark:border-slate-700">{(() => { const url = r.values[data.fields.find((f) => f.type === "image")?.id ?? ""]; return url && /^https?:\/\//i.test(url) ? <img src={url} alt="" className="h-24 w-full object-cover" /> : <div className="h-24 bg-slate-100 dark:bg-slate-800" />; })()}<div className="space-y-2 p-2 text-xs"><strong>{recordTitle(data, r)}</strong>{titleField && <FieldEditor field={titleField} value={r.values[titleField.id] ?? ""} readOnly={readOnly} onSet={(v) => patch(r, titleField, v)} />}</div></div>)}</div>}
      {view.kind === "calendar" && <CalendarView month={month} setMonth={setMonth} rows={rows} data={data} field={date} readOnly={readOnly} patch={patch} />}
      {view.kind === "timeline" && <TimelineView rows={rows} data={data} start={date} end={end} readOnly={readOnly} patch={patch} />}
      {view.kind === "mindmap" && <MindMapView rows={rows} data={data} readOnly={readOnly} onChange={onChange} />}
      {!rows.length && <div className="p-4 text-center text-xs text-slate-400">No matching records. Add one to get started.</div>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t p-2 dark:border-slate-700">
      <button className={btnClass} disabled={readOnly} onClick={() => onChange(addRecord(data))}>+ Record</button>
      <button className={btnClass} onClick={() => downloadCollection("collection.csv", exportCollectionCsv(data), "text/csv")}>Export CSV</button>
      <button className={btnClass} onClick={() => downloadCollection("collection.json", JSON.stringify(data, null, 2), "application/json")}>Backup JSON</button>
      <button className={btnClass} disabled={readOnly} onClick={openImport}>Import CSV/JSON</button>
      <input ref={fileInput} type="file" accept=".csv,.json" className="hidden" onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  </div>;
}

function CalendarView({ month, setMonth, rows, data, field, readOnly, patch }: { month: string; setMonth: (value: string) => void; rows: CollectionRecord[]; data: CollectionBlockPayload; field?: CollectionField; readOnly: boolean; patch: (r: CollectionRecord, f: CollectionField, v: string) => void }) {
  const [year, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, m, 0, 12)).getUTCDate();
  const days = Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, i) => i - offset + 1);
  const shift = (n: number) => { const d = new Date(Date.UTC(year, m - 1 + n, 1)); setMonth(iso(d).slice(0, 7)); };
  return <div className="space-y-2"><div className="flex items-center gap-2"><button className={btnClass} onClick={() => shift(-1)}>←</button><strong>{month}</strong><button className={btnClass} onClick={() => shift(1)}>→</button>{!field && <span className="text-xs text-amber-600">Add a date field to use calendar</span>}</div><div className="grid grid-cols-7 gap-1 text-xs">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((x) => <strong key={x} className="text-center">{x}</strong>)}{days.map((day, i) => { const dateText = year + "-" + String(m).padStart(2, "0") + "-" + String(day).padStart(2, "0"); const matches = rows.filter((r) => field && r.values[field.id] === dateText); return <div key={i} className={"min-h-16 rounded border p-1 dark:border-slate-700 " + (day < 1 || day > length ? "opacity-25" : "")} onDragOver={(e) => { if (!readOnly) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/collection-record"); const record = rows.find((r) => r.id === id); if (record && field && day >= 1 && day <= length) patch(record, field, dateText); }}><span className="text-slate-500">{day >= 1 && day <= length ? day : ""}</span>{matches.map((r) => <div key={r.id} draggable={!readOnly} onDragStart={(e) => e.dataTransfer.setData("text/collection-record", r.id)} className="mt-1 truncate rounded bg-blue-100 p-1 text-blue-900" title={recordTitle(data, r)}>{recordTitle(data, r)}</div>)}</div>; })}</div><div className="text-xs text-slate-500">Drag events to reschedule. Records without a date are available in Table view.</div></div>;
}

function TimelineView({ rows, data, start, end, readOnly, patch }: { rows: CollectionRecord[]; data: CollectionBlockPayload; start?: CollectionField; end?: CollectionField; readOnly: boolean; patch: (r: CollectionRecord, f: CollectionField, v: string) => void }) {
  const dated = rows.map((r) => ({ record: r, start: asDay(r.values[start?.id ?? ""] || ""), end: asDay(r.values[end?.id ?? ""] || "") })).filter((v) => v.start);
  const min = dated.length ? Math.min(...dated.map((v) => v.start!.getTime())) : Date.now();
  const max = dated.length ? Math.max(...dated.map((v) => (v.end ?? v.start)!.getTime()), min + 7 * dayMs) : min + 7 * dayMs;
  const span = Math.max(dayMs, max - min + dayMs);
  return <div className="min-w-[500px] space-y-2 text-xs">{!start && <p className="text-amber-600">Add a date field for timeline.</p>}{dated.map((v) => <div key={v.record.id} className="grid grid-cols-[130px_1fr] items-center gap-2"><span className="truncate" title={recordTitle(data, v.record)}>{recordTitle(data, v.record)}</span><div className="relative h-7 rounded bg-slate-100 dark:bg-slate-800"><div className="absolute top-1 h-5 min-w-2 rounded bg-blue-500" style={{ left: ((v.start!.getTime() - min) / span * 100) + "%", width: (Math.max(dayMs, (v.end ?? v.start)!.getTime() - v.start!.getTime() + dayMs) / span * 100) + "%" }} /></div></div>)}<div className="flex gap-2">{start && <span>Start: {iso(new Date(min))}</span>}<span>End: {iso(new Date(max))}</span></div>{dated.map((v) => <div key={v.record.id + "-edit"} className="flex flex-wrap items-center gap-2 border-t py-1"><span className="w-32 truncate">{recordTitle(data, v.record)}</span>{start && <FieldEditor field={start} value={v.record.values[start.id] || ""} onSet={(x) => patch(v.record, start, x)} readOnly={readOnly} />}{end && <FieldEditor field={end} value={v.record.values[end.id] || ""} onSet={(x) => patch(v.record, end, x)} readOnly={readOnly} />}</div>)}</div>;
}

function MindMapView({ rows, data, readOnly, onChange }: { rows: CollectionRecord[]; data: CollectionBlockPayload; readOnly: boolean; onChange: (next: CollectionBlockPayload) => void }) {
  const ids = new Set(rows.map((r) => r.id));
  const children = new Map<string | null, CollectionRecord[]>();
  rows.forEach((r) => { const parent = r.parentId && ids.has(r.parentId) ? r.parentId : null; children.set(parent, [...(children.get(parent) ?? []), r]); });
  const render = (parent: string | null, depth: number, ancestors: Set<string>): React.ReactNode => depth > 40 ? null : (children.get(parent) ?? []).filter((r) => !ancestors.has(r.id)).map((r) => <div key={r.id} className="ml-3 border-l-2 border-slate-200 pl-3 dark:border-slate-700"><div className="my-1 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 dark:border-slate-700 dark:bg-slate-900"><strong className="min-w-24 text-xs">{recordTitle(data, r)}</strong><select aria-label={"Parent of " + recordTitle(data, r)} className={inputClass} disabled={readOnly} value={r.parentId && ids.has(r.parentId) ? r.parentId : ""} onChange={(e) => onChange(setParent(data, r.id, e.target.value || null))}><option value="">Root</option>{rows.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{recordTitle(data, x)}</option>)}</select></div>{render(r.id, depth + 1, new Set([...ancestors, r.id]))}</div>);
  return <div className="space-y-2"><p className="text-xs text-slate-500">Hierarchy uses record parent relationships. Edit record titles in Table view.</p>{render(null, 0, new Set())}</div>;
}
