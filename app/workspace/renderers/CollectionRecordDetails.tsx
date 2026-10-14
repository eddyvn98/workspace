"use client";
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { recordTitle, setRecordValue, updateRecordBody,
  type CollectionBlockPayload, type CollectionSources } from "../collections/model";
import { FieldEditor } from "./CollectionFieldEditor";

interface Props { data: CollectionBlockPayload; sources?: CollectionSources; recordId: string;
  readOnly: boolean; onChange: (data: CollectionBlockPayload) => void; onClose: () => void; }
/** A record is a content page, not merely one table row. All views edit the same ID. */
export function CollectionRecordDetails({ data, sources, recordId, readOnly, onChange, onClose }: Props) {
  const record = data.records.find(row => row.id === recordId);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  if (!record || typeof document === "undefined") return null;
  const page = <div className="fixed inset-0 z-[10020] flex justify-end bg-black/50"
    role="presentation" onPointerDown={event => event.stopPropagation()}>
    <button className="absolute inset-0 cursor-default" aria-label="Close record details" onClick={onClose} />
    <section role="dialog" aria-modal="true" aria-label={"Record " + recordTitle(data, record)}
      className="relative z-10 flex h-full w-full max-w-xl flex-col bg-white text-slate-900 shadow-xl dark:bg-slate-950 dark:text-slate-100">
      <header className="flex shrink-0 items-center justify-between border-b p-4">
        <h2 className="truncate text-lg font-semibold">{recordTitle(data, record)}</h2>
        <button className="rounded border px-3 py-1 text-sm" onClick={onClose}>Close</button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-xs text-slate-500">Record ID: {record.id}</p>
        {data.fields.map(field => <label key={field.id} className="block space-y-1 text-sm">
          <span className="text-xs font-medium">{field.name}</span>
          <FieldEditor field={field} value={record.values[field.id] ?? ""} readOnly={readOnly}
            data={data} sources={sources} recordId={record.id}
            onSet={value => onChange(setRecordValue(data, record.id, field.id, value))} />
        </label>)}
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Record notes</span>
          <textarea className="min-h-64 w-full rounded border bg-transparent p-3 text-sm"
            aria-label="Record notes" placeholder="Write details, meeting notes or a description..."
            maxLength={20000} readOnly={readOnly} value={record.body ?? ""}
            onChange={event => onChange(updateRecordBody(data, record.id, event.target.value))} />
        </label>
      </div>
    </section>
  </div>;
  return createPortal(page, document.body);
}
