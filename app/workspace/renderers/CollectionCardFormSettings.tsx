"use client";
import React from "react";
import type { CollectionField, CollectionView } from "../collections/model";
import { btnClass, hintClass } from "./CollectionFieldEditor";

interface Props {
  view: CollectionView; fields: CollectionField[]; readOnly: boolean;
  onChange: (patch: Partial<CollectionView>) => void;
}
export function CollectionCardFormSettings({ view, fields, readOnly, onChange }: Props) {
  if (view.kind !== "gallery" && view.kind !== "form") return null;
  const isForm = view.kind === "form";
  const allowed = isForm ? fields.filter(field => !["lookup", "formula", "rollup"].includes(field.type)) :
    fields.filter(field => field.type !== "image");
  const defaultGallery = allowed.filter(field => field.id !== fields[0]?.id).slice(0, 3).map(field => field.id);
  const visible = isForm ? (view.formFieldIds ?? allowed.map(field => field.id))
    : (view.galleryFieldIds ?? defaultGallery);
  const required = view.formRequiredFieldIds ?? [fields[0]?.id].filter((id): id is string => !!id);
  const toggleVisible = (id: string, checked: boolean) => {
    const next = checked ? [...visible, id] : visible.filter(item => item !== id);
    if (isForm) onChange({ formFieldIds: next, formRequiredFieldIds: required.filter(item => next.includes(item)) });
    else onChange({ galleryFieldIds: next });
  };
  return <section className="space-y-2 border-b border-slate-200 py-3 dark:border-slate-700" aria-label={isForm ? "Form settings" : "Gallery settings"}
    data-testid="collection-card-form-settings">
    <strong>{isForm ? "Form fields" : "Gallery card fields"}</strong>
    {isForm && <p className={hintClass}>Required fields must be included in the form. Computed fields cannot be submitted.</p>}
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {allowed.map(field => <div key={field.id} className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" aria-label={"Show " + field.name + " in " + (isForm ? "Form" : "Gallery")}
            checked={visible.includes(field.id)} disabled={readOnly}
            onChange={event => toggleVisible(field.id, event.target.checked)} />
          {field.name}
        </label>
        {isForm && <label className="flex items-center gap-1">
          <input type="checkbox" aria-label={"Require " + field.name + " in Form"}
            checked={visible.includes(field.id) && required.includes(field.id)}
            disabled={readOnly || !visible.includes(field.id)}
            onChange={event => onChange({ formRequiredFieldIds: event.target.checked
              ? [...required, field.id] : required.filter(id => id !== field.id) })} />
          Required
        </label>}
      </div>)}
    </div>
    {isForm && !visible.length && <p role="status" className={hintClass}>Select at least one field to accept submissions.</p>}
  </section>;
}
