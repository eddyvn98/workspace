"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CollectionScheduledAutomationSettings } from "./CollectionScheduledAutomationSettings";
import { CollectionAuditPanel } from "./CollectionAuditPanel";
import { CollectionIntegrityPanel } from "./CollectionIntegrityPanel";
import { CollectionViewConditions } from "./CollectionViewConditions";
import { createPortal } from "react-dom";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { isCollectionBlockPayload, normalizeCollection } from "../collections/model";
import type { CollectionBlockPayload, CollectionSources, CollectionField, CollectionRecord, CollectionView } from "../collections/model";
import { addField, addRecord, addView, dateField, deleteRecord, endDateField, FIELD_TYPES, newId, primaryField, recordTitle, removeField, removeView, selectField, setParent, setRecordValue, updateField, updateView, VIEW_KINDS, visibleRecords } from "../collections/model";
import { downloadCollection, exportCollectionCsv, importCollectionCsv, importCollectionJson } from "../collections/io";

interface Props { blockId: string; data: CollectionBlockPayload; sources?: CollectionSources;
  standalone?: boolean;
  revisionNotice?: { stale: boolean; refreshing: boolean; error: string; refresh: () => Promise<void> };
  onChange: (next: CollectionBlockPayload) => void; readOnly: boolean }

export function CollectionSurface({ blockId, data, sources = {}, revisionNotice, standalone = false, onChange, readOnly }: Props) {
  const [search, setSearch] = useState("");
  const [localViewId, setLocalViewId] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [full, setFull] = useState(false);
  const expanded = full || standalone;
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const fileInput = useRef<HTMLInputElement>(null);
  const openCollectionButton = useRef<HTMLButtonElement>(null);
  const backToWorkspaceButton = useRef<HTMLButtonElement>(null);
  const wasFull = useRef(false);
  const closeFull = useCallback(() => {
    if (window.history.state?.collectionFullscreen === blockId) {
      window.history.back();
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("collectionScreen") === blockId) url.searchParams.delete("collectionScreen");
    window.history.replaceState(window.history.state, "", url);
    setFull(false);
  }, [blockId]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("collectionScreen") === blockId) setFull(true);
  }, [blockId]);
  useEffect(() => {
    const syncFocusedRoute = () => setFull(new URLSearchParams(window.location.search).get("collectionScreen") === blockId);
    window.addEventListener("popstate", syncFocusedRoute);
    return () => window.removeEventListener("popstate", syncFocusedRoute);
  }, [blockId]);
  useEffect(() => {
    if (full) { wasFull.current = true; return; }
    if (wasFull.current) {
      wasFull.current = false;
      openCollectionButton.current?.focus();
    }
  }, [full]);
  useEffect(() => {
    if (!full) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => backToWorkspaceButton.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFull();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [blockId, closeFull, full]);
  const openFull = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("collectionScreen", blockId);
    window.history.pushState({ ...window.history.state, collectionFullscreen: blockId }, "", url);
    setFull(true);
  };
  const view = data.views.find((v) => v.id === (localViewId ?? data.activeViewId)) ?? data.views[0];
  const rows = useMemo(() => visibleRecords(data, view, search, sources), [data, view, search, sources]);
  const titleField = primaryField(data);
  const group = selectField(data, view);
  const date = dateField(data, view);
  const end = endDateField(data, view);
  const patch = (record: CollectionRecord, field: CollectionField, value: string) => {
    // Read the latest Collection from the store rather than this render's snapshot.
    // Two edits in one render/save window must never replay stale record values.
    const state = useWorkspaceStore.getState();
    const current = state.blocks[blockId];
    if (readOnly || current?.type !== "collection" || !isCollectionBlockPayload(current.data)) return;
    const next = setRecordValue(normalizeCollection(current.data), record.id, field.id, value);
    if (next !== current.data) state.updateBlock(blockId, { data: next });
  };
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
  const keepFocusInScreen = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!full || event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])',
    )].filter(element => element.getClientRects().length > 0);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  };
  const content = <div data-testid="collection-block" role={full ? "dialog" : undefined} aria-modal={full ? true : undefined}
    aria-label={full ? `${data.title || "Untitled collection"} Collection screen` : undefined}
    tabIndex={full ? -1 : undefined} onKeyDown={keepFocusInScreen}
    className={"flex h-full w-full flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 " + (full ? "fixed inset-0 z-[9999] p-0" : "")}
    onPointerDown={(e) => { if (!(e.target as HTMLElement).closest("[data-collection-drag-handle]")) e.stopPropagation(); }} onDoubleClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
    {expanded && <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-200 sm:min-h-16 sm:flex-row sm:items-center sm:gap-3 sm:px-8 sm:py-0">
      <div className="flex min-w-0 items-center gap-2 sm:flex-1 sm:gap-3">
        {full ? <button ref={backToWorkspaceButton} type="button" className={btnClass + " shrink-0"} aria-label="Back to Workspace" onClick={closeFull}>← Workspace</button> : null}
        <span className="hidden h-7 border-l border-slate-200 sm:block" />
        <input aria-label="Collection title" className="min-w-0 flex-1 bg-transparent text-base font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:text-lg" title={data.title} value={data.title} disabled={readOnly} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </div>
      <div className="flex items-center justify-end gap-2 sm:gap-3">
        <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 sm:inline-flex">{data.records.length} records</span>
        <button type="button" aria-pressed={settings} className={btnClass + (settings ? " bg-slate-100 text-slate-900" : "")} onClick={() => { setSettings(!settings); setShowHistory(false); }}>Settings</button>
        <button type="button" aria-pressed={showHistory} className={btnClass + (showHistory ? " bg-slate-100 text-slate-900" : "")} onClick={() => { setShowHistory(!showHistory); setSettings(false); }}>{showHistory ? "Hide history" : "History"}</button>
        {full && <button type="button" className={btnClass + " shrink-0 bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"} aria-label="Exit collection screen" onClick={closeFull}>Exit</button>}
      </div>
    </div>}
    {!expanded && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950">
      {!full && <span data-collection-drag-handle title="Drag collection on canvas" className="cursor-move select-none rounded border px-2 py-1 text-xs text-slate-400">⋮⋮</span>}
      {!full && <input aria-label="Collection title" className="min-w-24 flex-1 bg-transparent text-sm font-semibold outline-none" value={data.title} disabled={readOnly} onChange={(e) => onChange({ ...data, title: e.target.value })} />}
      <span className="text-xs text-slate-400">{data.records.length} records</span>
      <button ref={openCollectionButton} className={btnClass} onClick={openFull}>Open collection</button>
      <button aria-pressed={settings} className={btnClass} onClick={() => { setSettings(!settings); setShowHistory(false); }}>Settings</button>
      <button aria-pressed={showHistory} className={btnClass} onClick={() => { setShowHistory(!showHistory); setSettings(false); }}>{showHistory ? "Hide history" : "History"}</button>
    </div>}
    {revisionNotice?.stale && <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1 text-xs">
      <span>Another session has saved a newer board version.</span>
      <button className={btnClass} disabled={revisionNotice.refreshing} onClick={() => void revisionNotice.refresh()}>
        {revisionNotice.refreshing ? "Saving..." : "Save & refresh"}
      </button>
      {revisionNotice.error && <span role="alert">{revisionNotice.error}</span>}
    </div>}
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-950">
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
      {data.views.map((v) => <button key={v.id} aria-pressed={v.id === view.id} className={btnClass + (v.id === view.id ? " bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : " text-slate-500 dark:text-slate-400")} onClick={() => { if (readOnly) setLocalViewId(v.id); else { setLocalViewId(null); onChange({ ...data, activeViewId: v.id }); } }}>{v.name}</button>)}
      </div>
      {!readOnly && <select aria-label="Add view" className={inputClass} value="" onChange={(e) => e.target.value && onChange(addView(data, e.target.value as CollectionView["kind"]))}><option value="">+ View</option>{VIEW_KINDS.map((v) => <option key={v} value={v}>{v}</option>)}</select>}
      <input aria-label="Search records" className={inputClass + " ml-auto w-44"} placeholder="Search records" value={search} onChange={(e) => setSearch(e.target.value)} />
    </div>
    <div className={"flex min-h-0 flex-1 flex-col overflow-hidden " + (settings || showHistory ? "md:flex-row" : "")}>
    {(settings || showHistory) && <aside className="max-h-[min(55vh,28rem)] min-h-0 shrink-0 overflow-y-auto overscroll-contain px-3 py-2 md:h-full md:max-h-none md:w-[min(24vw,20rem)] md:border-r md:border-slate-200 dark:md:border-slate-700">
    {showHistory && <CollectionAuditPanel data={data} onClose={() => setShowHistory(false)} />}
    {settings && <div role="region" aria-label="Collection settings" tabIndex={0} data-testid="collection-settings"
      className="min-h-0 space-y-2 text-xs">
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
      <CollectionScheduledAutomationSettings data={data} readOnly={readOnly} onChange={onChange} />
      <CollectionIntegrityPanel data={data} sources={sources} readOnly={readOnly} onChange={onChange} />
      <section aria-label="Field settings" className="space-y-2">
      <strong>Fields</strong>
      <div className="flex flex-col">
        {data.fields.map((f) => <span key={f.id} className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-2 last:border-0 dark:border-slate-700"><input aria-label={"Rename " + f.name} className="w-24 max-w-full bg-transparent" value={f.name} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { name: e.target.value }))} /><select aria-label={"Type " + f.name} className={inputClass} value={f.type} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { type: e.target.value as CollectionField["type"] }))}>{FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>{(f.type === "lookup" || f.type === "rollup") && <><select aria-label={"Lookup relation " + f.name} className={inputClass} value={f.relationFieldId ?? ""} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { relationFieldId: e.target.value || undefined }))}><option value="">Choose relation</option>{data.fields.filter((x) => x.type === "relation").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><select aria-label={"Lookup target " + f.name} className={inputClass} value={f.targetFieldId ?? ""} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { targetFieldId: e.target.value || undefined }))}><option value="">Choose field</option>{(() => { const relation = data.fields.find(x => x.id === f.relationFieldId);
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
          {f.formulaOperation !== "expression" && [0, 1].map((i) => <select key={i} aria-label={"Formula source " + (i + 1) + " " + f.name} className={inputClass} value={f.formulaFieldIds?.[i] ?? ""} disabled={readOnly} onChange={(e) => { const ids = [...(f.formulaFieldIds ?? ["", ""])]; ids[i] = e.target.value; onChange(updateField(data, f.id, { formulaFieldIds: ids })); }}><option value="">Choose field</option>{data.fields.filter((x) => x.id !== f.id && x.type !== "formula").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>)}</>}{f.type === "select" && <input aria-label={"Options " + f.name} className={inputClass + " w-56 max-w-full"} value={(f.options ?? []).join(", ")} disabled={readOnly} onChange={(e) => onChange(updateField(data, f.id, { options: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) }))}/>}<button type="button" className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:hover:bg-rose-950" aria-label={"Remove field " + f.name} disabled={readOnly || f.id === data.fields[0].id} onClick={() => onChange(removeField(data, f.id))}>×</button></span>)}
        <button className={btnClass + " self-start"} disabled={readOnly} onClick={() => onChange(addField(data, "Field " + (data.fields.length + 1), "text"))}>+ Field</button>
      </div></section>
    </div>}
    </aside>}
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-slate-50/80 p-4 dark:bg-slate-950">
      {view.kind === "table" && <CollectionTableView data={data} sources={sources} view={view} rows={rows} readOnly={readOnly} onChange={onChange} patch={patch} />}
      {view.kind === "kanban" && <CollectionKanbanView data={data} rows={rows} group={group} titleField={titleField} groupOptions={groupOptions} readOnly={readOnly} onChange={onChange} patch={patch} />}
      {view.kind === "gallery" && <CollectionGalleryView data={data} sources={sources} view={view} rows={rows} titleField={titleField} readOnly={readOnly} patch={patch} onChange={onChange} />}
      {view.kind === "calendar" && <CalendarView month={month} setMonth={setMonth} rows={rows} data={data} field={date} readOnly={readOnly} patch={patch} />}
      {view.kind === "timeline" && <TimelineView rows={rows} data={data} start={date} end={end} readOnly={readOnly} patch={patch} onChange={onChange} />}
      {view.kind === "mindmap" && <MindMapView rows={rows} data={data} readOnly={readOnly} onChange={onChange} />}
      {view.kind === "form" && <CollectionFormView data={data} sources={sources} view={view} readOnly={readOnly} onChange={onChange} />}
      {!rows.length && view.kind !== "form" && <div className="p-4 text-center text-xs text-slate-400">No matching records. Add one to get started.</div>}
    </div>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
      <button className={btnClass} disabled={readOnly} onClick={() => onChange(addRecord(data))}>+ Record</button>
      <button className={btnClass} onClick={() => downloadCollection("collection.csv", exportCollectionCsv(data, sources), "text/csv")}>Export CSV</button>
      <button className={btnClass} onClick={() => downloadCollection("collection.json", JSON.stringify(data, null, 2), "application/json")}>Backup JSON</button>
      <button className={btnClass} disabled={readOnly} onClick={openImport}>Import CSV/JSON</button>
      <input ref={fileInput} type="file" accept=".csv,.json" className="hidden" onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  </div>;
  if (full && typeof document !== "undefined") return createPortal(content, document.body);
  if (standalone) return content;
  const previewRecords = visibleRecords(data, view, "", sources).slice(0, 3);
  return <section data-testid="collection-block" aria-label={`${data.title || "Untitled collection"} preview`}
    className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
    onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
    <header className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-600">Collection · Workspace</div>
        <h2 className="mt-1 truncate text-sm font-semibold" title={data.title}>{data.title || "Untitled collection"}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{data.records.length} records · {view.name}</p>
      </div>
      <button ref={openCollectionButton} type="button" className={btnClass + " shrink-0"} onClick={openFull}>Open collection</button>
    </header>
    <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-hidden text-xs text-slate-600 dark:text-slate-300" aria-label="Recent records">
      {previewRecords.map((record) => <li key={record.id} className="truncate rounded bg-slate-50 px-2 py-1.5 dark:bg-slate-900">{recordTitle(data, record) || "Untitled record"}</li>)}
      {!previewRecords.length && <li className="rounded border border-dashed px-2 py-2 text-slate-400">No records yet</li>}
    </ul>
  </section>;
}
