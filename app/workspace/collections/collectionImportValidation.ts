import { FIELD_TYPES, VIEW_KINDS, type CollectionBlockPayload } from "./model";

const MAX_FIELDS = 100;
const MAX_RECORDS = 5000;
const MAX_VIEWS = 100;
const MAX_VALUE = 20000;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 128;
const text = (v: unknown, length: number): v is string =>
  typeof v === "string" && v.length <= length;
const stringList = (v: unknown, max = MAX_FIELDS): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every(id);

function uniqueIds(rows: unknown[], label: string): Set<string> {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!object(row) || !id(row.id) || seen.has(row.id)) {
      throw new Error(`Invalid or duplicate Collection ${label} ID`);
    }
    seen.add(row.id);
  }
  return seen;
}

function validateViews(rows: unknown[], fields: Set<string>): void {
  for (const item of rows) {
    if (!object(item) || !id(item.id) || !text(item.name, 200) ||
      !VIEW_KINDS.includes(item.kind as (typeof VIEW_KINDS)[number])) {
      throw new Error("Invalid Collection view");
    }
    for (const key of ["groupFieldId", "dateFieldId", "endDateFieldId"]) {
      if (item[key] !== undefined && !id(item[key])) throw new Error("Invalid Collection view field");
    }
    if (item.filters !== undefined && (!Array.isArray(item.filters) || item.filters.length > 50)) {
      throw new Error("Invalid Collection filters");
    }
    const checks = [
      ...(item.filter === undefined ? [] : [item.filter]),
      ...(item.filters === undefined ? [] : item.filters as unknown[]),
    ];
    for (const condition of checks) {
      if (!object(condition) || !id(condition.fieldId) ||
        !fields.has(condition.fieldId) || !text(condition.value, MAX_VALUE)) {
        throw new Error("Invalid Collection filter");
      }
    }
    if (item.sorts !== undefined && (!Array.isArray(item.sorts) || item.sorts.length > MAX_FIELDS)) {
      throw new Error("Invalid Collection sort list");
    }
    const sorts = [
      ...(item.sort === undefined ? [] : [item.sort]),
      ...(item.sorts === undefined ? [] : item.sorts as unknown[]),
    ];
    for (const sort of sorts) {
      if (!object(sort) || !id(sort.fieldId) || !fields.has(sort.fieldId) ||
        (sort.direction !== "asc" && sort.direction !== "desc")) {
        throw new Error("Invalid Collection sort");
      }
    }
    for (const key of ["galleryFieldIds", "formFieldIds", "formRequiredFieldIds"]) {
      if (item[key] !== undefined && (!stringList(item[key]) ||
        (item[key] as string[]).some(field => !fields.has(field)))) {
        throw new Error("Invalid Collection view field list");
      }
    }
  }
}

function validateDependencies(records: Array<Record<string, unknown>>, ids: Set<string>): void {
  const edges = new Map<string, string[]>();
  for (const row of records) {
    const deps = row.dependsOn ?? [];
    if (!stringList(deps, 20) || new Set(deps).size !== deps.length ||
      deps.some(dep => !ids.has(dep) || dep === row.id)) {
      throw new Error("Invalid Collection dependency reference");
    }
    edges.set(row.id as string, deps);
  }
  // Iterative DFS handles long imported chains without recursion overflow.
  const state = new Map<string, 1 | 2>();
  for (const root of ids) {
    const stack: Array<{ id: string; exit: boolean }> = [{ id: root, exit: false }];
    while (stack.length) {
      const item = stack.pop()!;
      if (item.exit) { state.set(item.id, 2); continue; }
      if (state.get(item.id) === 2) continue;
      if (state.get(item.id) === 1) throw new Error("Collection dependency cycle detected");
      state.set(item.id, 1);
      stack.push({ id: item.id, exit: true });
      for (const dep of edges.get(item.id) ?? []) stack.push({ id: dep, exit: false });
    }
  }
}

function validateParents(records: Array<Record<string, unknown>>): void {
  const parent = new Map(records.map(row => [row.id as string, row.parentId]));
  const checked = new Set<string>();
  for (const row of records) {
    const path = new Set<string>();
    let current: unknown = row.id;
    while (typeof current === "string" && parent.has(current) && !checked.has(current)) {
      if (path.has(current)) throw new Error("Collection parent cycle detected");
      path.add(current);
      current = parent.get(current);
    }
    for (const key of path) checked.add(key);
  }
}

/** Validate JSON at the import boundary before it can replace an open board. */
export function validateCollectionImport(value: unknown): CollectionBlockPayload {
  if (!object(value) || value.version !== 1 ||
    (value.title !== undefined && !text(value.title, 2000)) ||
    !Array.isArray(value.fields) || value.fields.length < 1 || value.fields.length > MAX_FIELDS ||
    !Array.isArray(value.records) || value.records.length > MAX_RECORDS ||
    !Array.isArray(value.views) || value.views.length < 1 || value.views.length > MAX_VIEWS) {
    throw new Error("Unsupported or oversized Collection JSON");
  }
  const fields = uniqueIds(value.fields, "field");
  const records = uniqueIds(value.records, "record");
  const views = uniqueIds(value.views, "view");
  if (value.activeViewId !== undefined &&
    (!id(value.activeViewId) || !views.has(value.activeViewId))) {
    throw new Error("Invalid Collection active view");
  }
  for (const field of value.fields as Array<Record<string, unknown>>) {
    if (!text(field.name, 200) || !FIELD_TYPES.includes(field.type as (typeof FIELD_TYPES)[number]) ||
      (field.options !== undefined && (!Array.isArray(field.options) ||
      field.options.length > 100 || !field.options.every((option: unknown) => text(option, 200))))) {
      throw new Error("Invalid Collection field definition");
    }
  }
  const rows = value.records as Array<Record<string, unknown>>;
  for (const row of rows) {
    if (!object(row.values) || Object.entries(row.values).some(([field, val]) =>
      !fields.has(field) || !text(val, MAX_VALUE)) ||
      (row.body !== undefined && !text(row.body, MAX_VALUE)) ||
      (row.parentId !== undefined && row.parentId !== null && !id(row.parentId)) ||
      (row.dependsOn !== undefined && !stringList(row.dependsOn, 20))) {
      throw new Error("Invalid Collection record values");
    }
  }
  validateParents(rows);
  validateDependencies(rows, records);
  validateViews(value.views, fields);
  return value as unknown as CollectionBlockPayload;
}
