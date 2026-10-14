"use client";
import React, { useState } from "react";
import type { CollectionBlockPayload, CollectionField, CollectionView } from "../collections/model";
import { formFields, requiredFormFieldIds, submitCollectionForm } from "../collections/collectionForm";
import { btnClass, inputClass } from "./CollectionFieldEditor";
import { recordTitle } from "../collections/model";

interface Props { data: CollectionBlockPayload; view: CollectionView; readOnly: boolean;
  onChange: (next: CollectionBlockPayload) => void; }
function FormInput({ field, data, value, onSet, readOnly, required }: {
  field: CollectionField; data: CollectionBlockPayload; value: string; onSet: (v: string) => void;
  readOnly: boolean; required: boolean;
}) {
  if (field.type === "checkbox") return <input type="checkbox" checked={value === "true"} required={required}
    disabled={readOnly} onChange={event => onSet(String(event.target.checked))} />;
  if (field.type === "select" || field.type === "relation") {
    const options = field.type === "select" ? (field.options ?? []).map(option => ({ id: option, name: option })) :
      data.records.map(record => ({ id: record.id, name: recordTitle(data, record) }));
    return <select className={inputClass + " w-full"} value={value} disabled={readOnly} required={required}
      onChange={event => onSet(event.target.value)}>
      <option value="">Choose...</option>
      {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>;
  }
  return <input className={inputClass + " w-full"} value={value} required={required}
    maxLength={field.type === "number" ? undefined : 2000}
    disabled={readOnly} type={field.type === "number" ? "number" : field.type === "date" ? "date"
      : field.type === "url" ? "url" : "text"}
    onChange={event => onSet(event.target.value)} />;
}
export function CollectionFormView({ data, view, readOnly, onChange }: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const fields = formFields(data, view);
  const required = new Set(requiredFormFieldIds(data, view));
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) return;
    const result = submitCollectionForm(data, view, draft);
    if (!result.ok) { setFeedback(result.error); return; }
    onChange(result.data);
    setDraft({});
    setFeedback("Record created.");
  };
  return <form key={view.id} className="mx-auto max-w-lg space-y-4 rounded-xl border p-4"
    aria-label="Collection form" data-testid="collection-form" onSubmit={submit}>
    <h3 className="text-base font-semibold">{view.name}</h3>
    <p className="text-xs text-slate-500">Responses become records in {data.title}.</p>
    {fields.map(field => <label key={field.id} className="block space-y-1 text-xs">
      <span className="font-semibold">{field.name}{required.has(field.id) ? " *" : ""}</span>
      <FormInput field={field} data={data} readOnly={readOnly} required={required.has(field.id)}
        value={draft[field.id] ?? ""} onSet={value => { setDraft(previous => ({ ...previous, [field.id]: value })); setFeedback(""); }} />
    </label>)}
    <button type="submit" className={btnClass} disabled={readOnly || !fields.length || data.records.length >= 5000}>Submit record</button>
    {readOnly && <p className="text-xs text-slate-500">Read-only access: submissions are disabled.</p>}
    {feedback && <p role="status" className="text-xs">{feedback}</p>}
  </form>;
}
