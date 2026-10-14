"use client";
import React, { useState } from "react";
import { recordTitle, type CollectionBlockPayload, type CollectionField, type CollectionRecord,
  type CollectionView } from "../collections/model";
import { btnClass, FieldEditor } from "./CollectionFieldEditor";
interface Props { data: CollectionBlockPayload; view: CollectionView; rows: CollectionRecord[];
  titleField?: CollectionField; readOnly: boolean;
  patch: (record: CollectionRecord, field: CollectionField, value: string) => void; }
const PAGE = 24;
export function CollectionGalleryView({ data, view, rows, titleField, readOnly, patch }: Props) {
  const [limit, setLimit] = useState(PAGE);
  const eligible = data.fields.filter(field => field.id !== titleField?.id && field.type !== "image");
  const fieldIds = view.galleryFieldIds ?? eligible.slice(0, 3).map(field => field.id);
  const details = eligible.filter(field => fieldIds.includes(field.id));
  const image = data.fields.find(field => field.type === "image");
  return <div className="space-y-3" data-testid="collection-gallery">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.slice(0, limit).map(record => {
        const url = image ? record.values[image.id] : undefined;
        return <article key={record.id} className="overflow-hidden rounded-lg border dark:border-slate-700"
          data-testid="collection-gallery-card" data-record-id={record.id}>
          {url && /^https?:\/\//i.test(url)
            ? <img src={url} alt="" loading="lazy" className="h-28 w-full object-cover" />
            : <div className="h-28 bg-slate-100 dark:bg-slate-800" />}
          <div className="space-y-2 p-3 text-xs">
            <strong className="block truncate" title={recordTitle(data, record)}>{recordTitle(data, record)}</strong>
            {titleField && <FieldEditor field={titleField} value={record.values[titleField.id] ?? ""}
              readOnly={readOnly} onSet={value => patch(record, titleField, value)} />}
            {details.map(field => <label key={field.id} className="block space-y-1">
              <span className="text-slate-500">{field.name}</span>
              <FieldEditor field={field} value={record.values[field.id] ?? ""}
                readOnly={readOnly} data={data} recordId={record.id}
                onSet={value => patch(record, field, value)} />
            </label>)}
          </div>
        </article>;
      })}
    </div>
    {rows.length > limit && <button type="button" className={btnClass}
      onClick={() => setLimit(current => current + PAGE)}>Show more cards ({rows.length - limit} remaining)</button>}
  </div>;
}
