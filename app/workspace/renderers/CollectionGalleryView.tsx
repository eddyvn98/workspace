"use client";
import React from "react";
import { recordTitle, type CollectionBlockPayload, type CollectionField, type CollectionRecord } from "../collections/model";
import { FieldEditor } from "./CollectionFieldEditor";
interface Props { data: CollectionBlockPayload; rows: CollectionRecord[]; titleField?: CollectionField; readOnly: boolean;
  patch: (record: CollectionRecord, field: CollectionField, value: string) => void; }
export function CollectionGalleryView({ data, rows, titleField, readOnly, patch }: Props) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{rows.map((r) => <div key={r.id} className="overflow-hidden rounded-lg border dark:border-slate-700">{(() => { const url = r.values[data.fields.find((f) => f.type === "image")?.id ?? ""]; return url && /^https?:\/\//i.test(url) ? <img src={url} alt="" className="h-24 w-full object-cover" /> : <div className="h-24 bg-slate-100 dark:bg-slate-800" />; })()}<div className="space-y-2 p-2 text-xs"><strong>{recordTitle(data, r)}</strong>{titleField && <FieldEditor field={titleField} value={r.values[titleField.id] ?? ""} readOnly={readOnly} onSet={(v) => patch(r, titleField, v)} />}</div></div>)}</div>;
}
