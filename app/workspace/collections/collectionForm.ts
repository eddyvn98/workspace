import { addRecord, type CollectionBlockPayload, type CollectionField, type CollectionView } from "./model";
import { relationValueValid } from "./collectionRelations";

/** Form values are validated before a single canonical Collection mutation. */
export const formFields = (data: CollectionBlockPayload, view: CollectionView): CollectionField[] => {
  const eligible = data.fields.filter(field => !["formula", "lookup", "rollup"].includes(field.type));
  return view.formFieldIds === undefined ? eligible :
    eligible.filter(field => view.formFieldIds!.includes(field.id));
};

export const requiredFormFieldIds = (data: CollectionBlockPayload, view: CollectionView): string[] => {
  const ids = view.formRequiredFieldIds ?? [data.fields[0]?.id].filter((id): id is string => !!id);
  const visible = new Set(formFields(data, view).map(field => field.id));
  return ids.filter(id => visible.has(id));
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validValue(data: CollectionBlockPayload, field: CollectionField, value: string): boolean {
  if (value.length > 2000) return false;
  if (!value) return true;
  if (field.type === "number") return Number.isFinite(Number(value));
  if (field.type === "date") return validDate(value);
  if (field.type === "checkbox") return value === "true" || value === "false";
  if (field.type === "select") return (field.options ?? []).includes(value);
  if (field.type === "relation") return relationValueValid(data, field, value);
  if (field.type === "url") {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch { return false; }
  }
  return true;
}
export type CollectionFormResult =
  | { ok: true; data: CollectionBlockPayload }
  | { ok: false; error: string };

/** Hidden, unknown and computed values never enter persisted records. */
export function submitCollectionForm(data: CollectionBlockPayload, view: CollectionView,
  draft: Record<string, string>): CollectionFormResult {
  if (view.kind !== "form") return { ok: false, error: "This view is not a Form." };
  if (data.records.length >= 5000) return { ok: false, error: "Collection record limit reached." };
  const fields = formFields(data, view);
  if (!fields.length) return { ok: false, error: "Select at least one form field." };
  const required = new Set(requiredFormFieldIds(data, view));
  const values: Record<string, string> = {};
  for (const field of fields) {
    const value = draft[field.id] ?? "";
    if (typeof value !== "string" || !validValue(data, field, value)) {
      return { ok: false, error: "Invalid value for " + field.name + "." };
    }
    if (required.has(field.id) && (!value.trim() || (field.type === "checkbox" && value !== "true"))) {
      return { ok: false, error: field.name + " is required." };
    }
    if (value !== "") values[field.id] = value;
  }
  return { ok: true, data: addRecord(data, values) };
}
