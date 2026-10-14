"use client";

import React, { useMemo, useRef, useState } from "react";
import { btnClass, inputClass, FieldEditor } from "./CollectionFieldEditor";
import { CalendarView } from "./CollectionCalendarView";
import { TimelineView } from "./CollectionTimelineView";
import { MindMapView } from "./CollectionMindMapView";
import { CollectionTableView } from "./CollectionTableView";
import { CollectionKanbanView } from "./CollectionKanbanView";
import { CollectionGalleryView } from "./CollectionGalleryView";
import { CollectionFormView } from "./CollectionFormView";
import { CollectionCardFormSettings } from "./CollectionCardFormSettings";
import { CollectionAutomationSettings } from "./CollectionAutomationSettings";
import { CollectionViewConditions } from "./CollectionViewConditions";
import { createPortal } from "react-dom";
import type { CollectionBlockPayload, CollectionSources, CollectionField, CollectionRecord, CollectionView } from "../collections/model";
import { addField, addRecord, addView, dateField, deleteRecord, endDateField, FIELD_TYPES, newId, primaryField, recordTitle, removeField, removeView, selectField, setParent, setRecordValue, updateField, updateView, VIEW_KINDS, visibleRecords } from "../collections/model";
import { downloadCollection, exportCollectionCsv, importCollectionCsv, importCollectionJson } from "../collections/io";

interface Props { data: CollectionBlockPayload; sources?: CollectionSources;
  onChange: (next: CollectionBlockPayload) => void; readOnly: boolean }

export function CollectionSurface({ data, sources = {}, onChange, readOnly }: Props) {
  const [search, setSearch] = useState("");
  const [localViewId, setLocalViewId] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [full, setFull] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const fileInput = useRef<HTMLInputElement>(null);
  const view = data.views.find((v) => v.id === (localViewId ?? data.activeViewId)) ?? data.views[0];
  const rows = useMemo(() => visibleRecords(data, view, search, sources), [data, view, search, sources]);
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
  const content = <div className={"flex h-full w-full flex-col overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 " + (full ? "fixed inset-0 z-[9999] p-2 sm:p-6" : "")}
    onPointerDown={(e) => { if (!(e.target as HTMLElement).closest("[data-collection-drag-handle]")) e.stopPropagation(); }} onDoubleClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 p-2 dark:border-slate-700">
      <span data-collection-drag-handle title="Drag collection on canvas" className="cursor-move select-none rounded border px-2 py-1 text-xs text-slate-400">⋮⋮</span>
      <input aria-label="Collection title" className="min-w-24 flex-1 bg-transparent text-sm font-semibold outline-none" value={data.title} disabled={readOnly} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      <span className="text-xs text-slate-400">{data.records.length} records</span>
      <button className={btnClass} onClick={() => setFull(!full)}>{full ? "Exit full screen" : "Expand"}</button>
      <button className={btnClass} onClick={() => setSettings(!settings)}>Settings</button>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-200 p-2 dark:border-slate-700">
      {data.views.map((v) => <button key={v.id} className={btnClass + (v.id === view.id ? " border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900" : "")} onClick={() => { if (readOnly) setLocalViewId(v.id); else { setLocalViewId(null); onChange({ ...data, activeViewId: v.id }); } }}>{v.name}</button>)}
      {!readOnly && <select aria-label="Add view" className={inputClass} value="" onChange={(e) => e.target.value && onChange(addView(data, e.target.value as CollectionView["kind"]))}><option value="">+ View</option>{VIEW_KINDS.map((v) => <option key={v} value={v}>{v}</option>)}</select>}
      <input aria-label="Search records" className={inputClass + " ml-auto w-32"} placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
    </div>
    {settings && <div role="region" aria-label="Collection settings" tabIndex={0} data-testid="collection-settings"
      className="max-h-[min(55vh,28rem)] min-h-0 shrink-0 space-y-2 overflow-y-scroll overscroll-contain border-b bg-slate-50 p-2 text-xs dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2"><label>View name <input className={inputClass} value={view.name} disabled={readOnly} onChange={(e) => renameView({ name: e.target.value })} /></label>
        <button className={btnClass} disabled={readOnly || data.views.length <= 1} onClick={() => onChange(removeView(data, view.id))}>Delete view</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {view.kind === "kanban" && <label>Group <select className={inputClass} value={group?.id ?? ""} disabled={readOnly} onChange={(e) => renameView({ groupFieldId: e.target.value })}>{data.fields.filter((f) => f.type === "select").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
        {(view.kind === "calendar" || view.kind === "timeline") && <><label>Date <select aria-label="Date" className={inputClass} value={date?.id ?? ""} disabled={readOnly} onChange={(e) => renameView({ dateFieldId: e.target.value })}>{data.fields.filter((f) => f.type === "date").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>{view.kind === "timeline" && <label>End <select className={inputClass} value={end?.id ?? ""} disabled={readOnly} onChange={(e) => renameView({ endDateFieldId: e.target.value })}>{data.fields.filter((f) => f.type === "date").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}</> }
      </div>
      <CollectionViewConditions view={view} fields={data.fields} readOnly={readOnly} onChange={renameView} />
      <CollectionCardFormSettings view={view} fields={data.fields} readOnly={readOnly} onChange={renameView} />
      <CollectionAutomationSettings data={data} readOnly={readOnly} onChange={onChange} />
      <div className="flex flex-wrap gap-2 items-center">
        {data.fields.map((f) => <span key={f.id} className="flex items-center gap-1 rounded border p-1"><input aria-label={"Rename " + f.name} className="w-20 bg-transparent" value={f.name} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { name: e.target.value }))} /><select aria-label={"Type " + f.name} className={inputClass} value={f.type} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { type: e.target.value as CollectionField["type"] }))}>{FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>{(f.type === "lookup" || f.type === "rollup") && <><select aria-label={"Lookup relation " + f.name} className={inputClass} value={f.relationFieldId ?? ""} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { relationFieldId: e.target.value || undefined }))}><option value="">Choose relation</option>{data.fields.filter((x) => x.type === "relation").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><select aria-label={"Lookup target " + f.name} className={inputClass} value={f.targetFieldId ?? ""} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { targetFieldId: e.target.value || undefined }))}><option value="">Choose field</option>{(() => { const relation = data.fields.find(x => x.id === f.relationFieldId);
          const target = relation?.relationTargetBlockId ? sources[relation.relationTargetBlockId] : data;
          return (target?.fields ?? []).filter(x => x.id !== f.id && !["lookup", "rollup", "formula", "relation"].includes(x.type))
            .map(x => <option key={x.id} value={x.id}>{x.name}</option>); })()}</select></>}{f.type === "rollup" && <select aria-label={"Rollup operation " + f.name} className={inputClass}
          value={f.rollupOperation ?? "count"} disabled={readOnly}
          onChange={e => onChange(updateField(data, f.id, { rollupOperation: e.target.value as CollectionField["rollupOperation"] }))}>
          {["count", "sum", "average", "min", "max"].map(op => <option key={op}>{op}</option>)}
        </select>}{f.type === "relation" && <label>Target collection
          <select aria-label={"Relation collection " + f.name} className={inputClass}
            value={f.relationTargetBlockId ?? ""} disabled={readOnly}
            onChange={event => {
              const next = updateField(data, f.id, { relationTargetBlockId: event.target.value || undefined });
              onChange({ ...next, records: next.records.map(record => ({ ...record,
                values: { ...record.values, [f.id]: "" } })),
                fields: next.fields.map(field => field.relationFieldId === f.id
                  ? { ...field, targetFieldId: undefined } : field) });
            }}>
            <option value="">This collection</option>
            {Object.entries(sources).map(([id, item]) => <option key={id} value={id}>{item.title}</option>)}
          </select>
        </label>}{f.type === "relation" && <label>Multiple
          <input type="checkbox" aria-label={"Multiple links " + f.name} disabled={readOnly}
            checked={!!f.relationMultiple} onChange={e => {
              if (!e.target.checked && data.records.some(record => (record.values[f.id] ?? "").startsWith("["))) {
                window.alert("Remove multi-link values before switching to single selection."); return;
              }
              onChange(updateField(data, f.id, { relationMultiple: e.target.checked }));
            }} />
        </label>}{f.type === "formula" && <><select aria-label={"Formula operation " + f.name} className={inputClass} value={f.formulaOperation ?? ""} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { formulaOperation: e.target.value as CollectionField["formulaOperation"] }))}><option value="">Choose formula</option>{["sum", "subtract", "multiply", "divide", "average", "concat", "expression"].map((op) => <option key={op} value={op}>{op}</option>)}</select>{f.formulaOperation === "expression" && <input className={inputClass + " w-44"}
          aria-label={"Formula expression " + f.name} value={f.formulaExpression ?? ""}
          placeholder="{fieldId} * 1.1" maxLength={500} disabled={readOnly}
          onChange={event => onChange(updateField(data, f.id, { formulaExpression: event.target.value }))} />}
          {f.formulaOperation !== "expression" && [0, 1].map((i) => <select key={i} aria-label={"Formula source " + (i + 1) + " " + f.name} className={inputClass} value={f.formulaFieldIds?.[i] ?? ""} disabled={readOnly} onChange={(e) => { const ids = [...(f.formulaFieldIds ?? ["", ""])]; ids[i] = e.target.value; onChange(updateField(data, f.id, { formulaFieldIds: ids })); }}><option value="">Choose field</option>{data.fields.filter((x) => x.id !== f.id && x.type !== "formula").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>)}</>}{f.type === "select" && <input aria-label={"Options " + f.name} className={inputClass + " w-36"} value={(f.options ?? []).join(", ")} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { options: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) }))}/>}<button disabled={readOnly || f.id === data.fields[0].id} onClick={() => onChange(removeField(data, f.id))}>×</button></span>)}
        <button className={btnClass} disabled={readOnly} onClick={() => onChange(addField(data, "Field " + (data.fields.length + 1), "text"))}>+ Field</button>
      </div>
    </div>}
    <div className="min-h-0 flex-1 overflow-auto p-2">
      {view.kind === "table" && <CollectionTableView data={data} sources={sources} view={view} rows={rows} readOnly={readOnly} onChange={onChange} patch={patch} />}
      {view.kind === "kanban" && <CollectionKanbanView data={data} rows={rows} group={group} titleField={titleField} groupOptions={groupOptions} readOnly={readOnly} onChange={onChange} patch={patch} />}
      {view.kind === "gallery" && <CollectionGalleryView data={data} sources={sources} view={view} rows={rows} titleField={titleField} readOnly={readOnly} patch={patch} />}
      {view.kind === "calendar" && <CalendarView month={month} setMonth={setMonth} rows={rows} data={data} field={date} readOnly={readOnly} patch={patch} />}
      {view.kind === "timeline" && <TimelineView rows={rows} data={data} start={date} end={end} readOnly={readOnly} patch={patch} onChange={onChange} />}
      {view.kind === "mindmap" && <MindMapView rows={rows} data={data} readOnly={readOnly} onChange={onChange} />}
      {view.kind === "form" && <CollectionFormView data={data} sources={sources} view={view} readOnly={readOnly} onChange={onChange} />}
      {!rows.length && view.kind !== "form" && <div className="p-4 text-center text-xs text-slate-400">No matching records. Add one to get started.</div>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t p-2 dark:border-slate-700">
      <button className={btnClass} disabled={readOnly} onClick={() => onChange(addRecord(data))}>+ Record</button>
      <button className={btnClass} onClick={() => downloadCollection("collection.csv", exportCollectionCsv(data, sources), "text/csv")}>Export CSV</button>
      <button className={btnClass} onClick={() => downloadCollection("collection.json", JSON.stringify(data, null, 2), "application/json")}>Backup JSON</button>
      <button className={btnClass} disabled={readOnly} onClick={openImport}>Import CSV/JSON</button>
      <input ref={fileInput} type="file" accept=".csv,.json" className="hidden" onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  </div>;
  return full && typeof document !== "undefined" ? createPortal(content, document.body) : content;
}
