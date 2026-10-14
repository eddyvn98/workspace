import { createWorkspaceId } from "../utils/workspaceId";
import { matchesViewFilters, type CollectionFilter, type FilterLogic } from "./collectionFilters";
import { projectCollectionLookups, removeInboundRelations } from "./collectionRelations";
import { applyCollectionAutomations, sanitizeCollectionAutomations, type CollectionAutomation } from "./collectionAutomations";
import type { CollectionAuditEntry } from "./collectionAudit";
import { projectCollectionFormulas, type CollectionAggregation, type FormulaOperation } from "./collectionFormula";

export type CollectionFieldType = "text" | "number" | "date" | "select" | "checkbox" | "url" | "image" | "relation" | "lookup" | "rollup" | "formula";
export type CollectionViewKind = "table" | "kanban" | "calendar" | "timeline" | "gallery" | "mindmap" | "form";

export interface CollectionField {
  id: string;
  name: string;
  type: CollectionFieldType;
  options?: string[];
  /** Lookup: source relation and target field, both stable field IDs. */
  relationFieldId?: string;
  targetFieldId?: string;
  relationMultiple?: boolean;
  /** Optional Collection block on this board; absent means this Collection. */
  relationTargetBlockId?: string;
  rollupOperation?: "sum" | "average" | "min" | "max" | "count";
  formulaOperation?: FormulaOperation;
  formulaExpression?: string;
  formulaFieldIds?: string[];
}
export interface CollectionRecord {
  id: string;
  values: Record<string, string>;
  parentId?: string | null;
  /** Long-form record notes, shared by every view. */
  body?: string;
}
export interface CollectionView {
  id: string;
  name: string;
  kind: CollectionViewKind;
  groupFieldId?: string;
  dateFieldId?: string;
  endDateFieldId?: string;
  /** Legacy persisted single-condition representation. */
  filter?: { fieldId: string; value: string };
  sort?: { fieldId: string; direction: "asc" | "desc" };
  filters?: CollectionFilter[];
  filterLogic?: FilterLogic;
  aggregations?: CollectionAggregation[];
  sorts?: { fieldId: string; direction: "asc" | "desc" }[];
  /** Explicit field IDs shown on cards or form; undefined uses defaults. */
  galleryFieldIds?: string[];
  formFieldIds?: string[];
  formRequiredFieldIds?: string[];
}
export interface CollectionBlockPayload {
  version: 1;
  title: string;
  fields: CollectionField[];
  records: CollectionRecord[];
  views: CollectionView[];
  activeViewId: string;
  automations?: CollectionAutomation[];
  auditTrail?: CollectionAuditEntry[];
}

export type CollectionSources = Record<string, CollectionBlockPayload>;

export const VIEW_KINDS: CollectionViewKind[] = ["table", "kanban", "calendar", "timeline", "gallery", "mindmap", "form"];
export const FIELD_TYPES: CollectionFieldType[] = ["text", "number", "date", "select", "checkbox", "url", "image", "relation", "lookup", "rollup", "formula"];
export const newId = () => createWorkspaceId();

export function createCollection(): CollectionBlockPayload {
  const fields: CollectionField[] = [
    { id: newId(), name: "Name", type: "text" },
    { id: newId(), name: "Status", type: "select", options: ["To do", "In progress", "Done"] },
    { id: newId(), name: "Start", type: "date" },
    { id: newId(), name: "Due", type: "date" },
    { id: newId(), name: "Description", type: "text" },
    { id: newId(), name: "Image", type: "image" },
  ];
  const views = VIEW_KINDS.map((kind) => ({
    id: newId(), kind, name: kind === "mindmap" ? "Mind Map" : kind.charAt(0).toUpperCase() + kind.slice(1),
    ...(kind === "kanban" ? { groupFieldId: fields[1].id } : {}),
    ...(kind === "calendar" || kind === "timeline" ? { dateFieldId: fields[2].id, endDateFieldId: fields[3].id } : {}),
  }));
  return { version: 1, title: "Untitled collection", fields, records: [], views, activeViewId: views[0].id };
}

export function normalizeCollection(input: CollectionBlockPayload | null | undefined): CollectionBlockPayload {
  if (!input || !Array.isArray(input.fields) || !Array.isArray(input.records) || !Array.isArray(input.views)) return createCollection();
  const oldViews = input.views.length ? input.views : createCollection().views;
  const dates = input.fields.filter(field => field.type === "date");
  const views = oldViews.map(view => (view.kind === "timeline" || view.kind === "calendar")
    && dates.length >= 2 && view.dateFieldId === view.endDateFieldId
      ? { ...view, dateFieldId: dates[0].id, endDateFieldId: dates[1].id } : view);
  return { ...input, version: 1, title: input.title || "Untitled collection", views,
    automations: sanitizeCollectionAutomations(input), activeViewId: views.some((v) => v.id === input.activeViewId) ? input.activeViewId : views[0].id };
}
export function primaryField(data: CollectionBlockPayload): CollectionField | undefined {
  return data.fields.find((f) => f.type === "text") ?? data.fields[0];
}
export function fieldByType(data: CollectionBlockPayload, type: CollectionFieldType): CollectionField | undefined {
  return data.fields.find((field) => field.type === type);
}
export function recordTitle(data: CollectionBlockPayload, record: CollectionRecord): string {
  return record.values[primaryField(data)?.id ?? ""] || "Untitled";
}
export function selectField(data: CollectionBlockPayload, view: CollectionView): CollectionField | undefined {
  return data.fields.find((f) => f.id === view.groupFieldId && f.type === "select") ?? data.fields.find((f) => f.type === "select");
}
export function dateField(data: CollectionBlockPayload, view: CollectionView): CollectionField | undefined {
  return data.fields.find((f) => f.id === view.dateFieldId && f.type === "date") ?? data.fields.find((f) => f.type === "date");
}
export function endDateField(data: CollectionBlockPayload, view: CollectionView): CollectionField | undefined {
  return data.fields.find((f) => f.id === view.endDateFieldId && f.type === "date") ?? dateField(data, view);
}
export const viewFilters = (view: CollectionView): CollectionFilter[] => view.filters ?? (view.filter ? [view.filter] : []);
export const viewSorts = (view: CollectionView) => view.sorts ?? (view.sort ? [view.sort] : []);
/** New arrays override old scalar configs, including intentionally empty arrays. */
export function visibleRecords(data: CollectionBlockPayload, view: CollectionView, search = "",
  sources: CollectionSources = {}): CollectionRecord[] {
  // An unfinished filter row has no effect until its value is entered.
  // Keep it in the saved view so users can complete it after reload.
  const filters = viewFilters(view);
  const sorts = viewSorts(view);
  let rows = data.records.map(record => projectCollectionFormulas(data, projectCollectionLookups(data, record, sources)))
    .filter((r) => matchesViewFilters(r, data.fields, filters, view.filterLogic)
    && (!search || Object.values(r.values).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))));
  if (sorts.length) rows = [...rows].sort((a, b) => {
    for (const { fieldId, direction } of sorts) {
      const type = data.fields.find((f) => f.id === fieldId)?.type;
      const left = a.values[fieldId] ?? "", right = b.values[fieldId] ?? "";
      const diff = type === "number" ? Number(left || 0) - Number(right || 0)
        : left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
      if (diff) return direction === "desc" ? -diff : diff;
    }
    return 0;
  });
  return rows;
}
export function setRecordValue(data: CollectionBlockPayload, recordId: string, fieldId: string, value: string): CollectionBlockPayload {
  const field = data.fields.find(f => f.id === fieldId);
  if (!field || ["lookup", "formula", "rollup"].includes(field.type)) return data;
  if (!data.records.some(r => r.id === recordId)) return data;
  return { ...data, records: data.records.map((r) => {
    if (r.id !== recordId || r.values[fieldId] === value) return r;
    return applyCollectionAutomations(data, r, { ...r, values: { ...r.values, [fieldId]: value } }, [fieldId]);
  }) };
}
export function addRecord(data: CollectionBlockPayload, values: Record<string, string> = {}): CollectionBlockPayload {
  const id = newId();
  return { ...data, records: [...data.records,
    applyCollectionAutomations(data, null, { id, values }, Object.keys(values))] };
}
export function updateRecordBody(data: CollectionBlockPayload, recordId: string, body: string): CollectionBlockPayload {
  if (body.length > 20000 || !data.records.some(record => record.id === recordId)) return data;
  return { ...data, records: data.records.map(record => record.id === recordId
    ? { ...record, body } : record) };
}
export function deleteRecord(data: CollectionBlockPayload, recordId: string): CollectionBlockPayload {
  return { ...data, records: removeInboundRelations(data, recordId) };
}
export function addField(data: CollectionBlockPayload, name: string, type: CollectionFieldType): CollectionBlockPayload {
  if (!name.trim()) return data;
  return { ...data, fields: [...data.fields, { id: newId(), name: name.trim(), type, ...(type === "select" ? { options: ["Option 1"] } : {}) }] };
}
export function removeField(data: CollectionBlockPayload, fieldId: string): CollectionBlockPayload {
  if (data.fields.length < 2 || data.fields[0].id === fieldId) return data;
  return {
    ...data, fields: data.fields.filter((f) => f.id !== fieldId).map(f =>
      f.relationFieldId === fieldId || f.targetFieldId === fieldId
        ? { ...f, relationFieldId: f.relationFieldId === fieldId ? undefined : f.relationFieldId,
          targetFieldId: f.targetFieldId === fieldId ? undefined : f.targetFieldId } : f)
      .map(f => ({ ...f,
        ...(f.formulaFieldIds?.includes(fieldId) ? { formulaFieldIds: f.formulaFieldIds.filter(id => id !== fieldId) } : {}),
        ...(f.formulaExpression?.includes("{" + fieldId + "}") ? { formulaExpression: "" } : {}),
      })),
    records: data.records.map(({ values, ...r }) => ({ ...r, values: Object.fromEntries(Object.entries(values).filter(([id]) => id !== fieldId)) })),
    automations: (data.automations ?? []).filter(rule => rule.whenFieldId !== fieldId && rule.thenFieldId !== fieldId),
    views: data.views.map((v) => ({
      ...v,
      ...(v.groupFieldId === fieldId ? { groupFieldId: undefined } : {}),
      ...(v.dateFieldId === fieldId ? { dateFieldId: undefined } : {}),
      ...(v.endDateFieldId === fieldId ? { endDateFieldId: undefined } : {}),
      ...(v.sort?.fieldId === fieldId ? { sort: undefined } : {}),
      ...(v.filter?.fieldId === fieldId ? { filter: undefined } : {}),
      ...(v.filters ? { filters: v.filters.filter((item) => item.fieldId !== fieldId) } : {}),
      ...(v.sorts ? { sorts: v.sorts.filter((item) => item.fieldId !== fieldId) } : {}),
      ...(v.aggregations ? { aggregations: v.aggregations.filter(item => item.fieldId !== fieldId) } : {}),
      ...(v.galleryFieldIds ? { galleryFieldIds: v.galleryFieldIds.filter(id => id !== fieldId) } : {}),
      ...(v.formFieldIds ? { formFieldIds: v.formFieldIds.filter(id => id !== fieldId) } : {}),
      ...(v.formRequiredFieldIds ? { formRequiredFieldIds: v.formRequiredFieldIds.filter(id => id !== fieldId) } : {}),
    })),
  };
}
export function updateField(data: CollectionBlockPayload, fieldId: string, patch: Partial<CollectionField>): CollectionBlockPayload {
  return { ...data, fields: data.fields.map((f) => f.id === fieldId ? { ...f, ...patch, id: f.id } : f) };
}
export function addView(data: CollectionBlockPayload, kind: CollectionViewKind): CollectionBlockPayload {
  const field = kind === "kanban" ? data.fields.find((f) => f.type === "select") : undefined;
  const dates = data.fields.filter((f) => f.type === "date");
  const view: CollectionView = { id: newId(), kind, name: kind === "mindmap" ? "Mind Map" : kind.charAt(0).toUpperCase() + kind.slice(1),
    ...(field ? { groupFieldId: field.id } : {}),
    ...(kind === "calendar" || kind === "timeline" ? { dateFieldId: dates[0]?.id, endDateFieldId: dates[1]?.id ?? dates[0]?.id } : {}) };
  return { ...data, views: [...data.views, view], activeViewId: view.id };
}
export function removeView(data: CollectionBlockPayload, viewId: string): CollectionBlockPayload {
  if (data.views.length < 2) return data;
  const views = data.views.filter((v) => v.id !== viewId);
  return { ...data, views, activeViewId: viewId === data.activeViewId ? views[0].id : data.activeViewId };
}
export function updateView(data: CollectionBlockPayload, viewId: string, patch: Partial<CollectionView>): CollectionBlockPayload {
  return { ...data, views: data.views.map((v) => v.id === viewId ? { ...v, ...patch, id: v.id, kind: v.kind } : v) };
}
export function setParent(data: CollectionBlockPayload, recordId: string, parentId: string | null): CollectionBlockPayload {
  if (parentId === recordId || (parentId && !data.records.some((r) => r.id === parentId))) return data;
  const parents = new Map(data.records.map((r) => [r.id, r.parentId]));
  let cursor: string | null | undefined = parentId;
  while (cursor) { if (cursor === recordId) return data; cursor = parents.get(cursor); }
  return { ...data, records: data.records.map((r) => r.id === recordId ? { ...r, parentId } : r) };
}
