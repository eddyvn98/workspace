import type { CollectionBlockPayload } from "@/app/workspace/collections/model";
import type { WorkspaceJson } from "./contracts";
import { COLLECTION_COMMANDS } from "./collectionActionSchema";
import { normalizeCollectionValue } from "./collectionActionValidation";

type Named = { id: string; name: string };
type Resolution = { action: WorkspaceJson; error?: string };
const object = (value: unknown): WorkspaceJson | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as WorkspaceJson : null;
const normalize = (value: string) => value.normalize("NFC").trim().toLocaleLowerCase();

function matchIdOrName(items: Named[], reference: unknown, kind: string): { id?: string; error?: string } {
  if (typeof reference !== "string" || !reference.trim()) return {};
  const exact = items.find((item) => item.id === reference);
  if (exact) return { id: exact.id };
  const matches = items.filter((item) => normalize(item.name) === normalize(reference));
  if (matches.length === 1) return { id: matches[0].id };
  if (!matches.length) return { error: `No Collection ${kind} matches "${reference.slice(0, 160)}". Read the Collection for exact IDs.` };
  const candidates = matches.slice(0, 8).map((item) => `${item.name} [${item.id}]`).join(", ");
  return { error: `Ambiguous Collection ${kind} "${reference.slice(0, 160)}". Choose an exact ID: ${candidates}.` };
}

/** Resolve only exact, unique persisted names. Model-provided names are never persisted as IDs. */
export function resolveCollectionTargets(raw: WorkspaceJson, board: WorkspaceJson): Resolution {
  const type = String(raw.type ?? "");
  if (!COLLECTION_COMMANDS.has(type) || type === "convert_table_to_collection") return { action: raw };
  const block = object(object(board.blocks)?.[String(raw.blockId ?? "")]);
  const data = object(block?.data) as unknown as CollectionBlockPayload | null;
  if (!data || !Array.isArray(data.fields) || !Array.isArray(data.views) || !Array.isArray(data.records)) return { action: raw };

  const fields = data.fields.map((item) => ({ id: item.id, name: item.name }));
  const views = data.views.map((item) => ({ id: item.id, name: item.name }));
  const primaryId = data.fields[0]?.id;
  const records = data.records.map((item) => ({ id: item.id, name: String(item.values[primaryId] ?? "") }));
  const next: WorkspaceJson = { ...raw };
  const resolve = (key: string, alias: string | null, items: Named[], kind: string): string | null => {
    const explicitId = next[key];
    const named = alias ? next[alias] : undefined;
    if (alias) delete next[alias];
    if (named !== undefined && explicitId !== undefined && named !== explicitId) {
      const byId = matchIdOrName(items, explicitId, kind);
      const byName = matchIdOrName(items, named, kind);
      if (byId.id !== byName.id || !byId.id) return `Conflicting Collection ${kind} references. Use one exact ID.`;
    }
    const reference = named ?? explicitId;
    if (reference === undefined || reference === null) return null;
    const result = matchIdOrName(items, reference, kind);
    if (result.error) return result.error;
    if (result.id) next[key] = result.id;
    return null;
  };

  const fieldTarget = ["update_collection_field", "remove_collection_field"].includes(type);
  const viewTarget = ["configure_collection_view", "remove_collection_view"].includes(type);
  const recordTarget = ["update_collection_record", "delete_collection_record"].includes(type);
  if (fieldTarget) {
    const error = resolve("fieldId", "fieldName", fields, "field");
    if (error) return { action: next, error };
  }
  if (viewTarget || ["read_collection", "search_collection_records"].includes(type)) {
    const error = resolve("viewId", viewTarget ? "viewName" : null, views, "view");
    if (error) return { action: next, error };
  }
  if (recordTarget) {
    const error = resolve("recordId", "recordName", records, "record");
    if (error) return { action: next, error };
  }
  if (["create_collection_record", "update_collection_record"].includes(type)) {
    const values = object(raw.values);
    if (values) {
      const mapped: WorkspaceJson = {};
      for (const [reference, value] of Object.entries(values)) {
        const target = matchIdOrName(fields, reference, "field");
        if (target.error) return { action: next, error: target.error };
        if (target.id! in mapped) return { action: next, error: `Duplicate Collection field reference: ${reference}.` };
        mapped[target.id!] = normalizeCollectionValue(value) ?? value;
      }
      next.values = mapped;
    }
  }
  if (type === "add_collection_field" || type === "update_collection_field") {
    for (const key of ["relationFieldId", "targetFieldId"]) {
      const error = resolve(key, null, fields, "field");
      if (error) return { action: next, error };
    }
  }
  if ((type === "add_collection_field" || type === "update_collection_field") && Array.isArray(next.formulaFieldIds)) {
    const resolved: string[] = [];
    for (const name of next.formulaFieldIds) {
      const target = matchIdOrName(fields, name, "field");
      if (target.error) return { action: next, error: target.error };
      resolved.push(target.id!);
    }
    next.formulaFieldIds = resolved;
  }
  if (type === "configure_collection_view") {
    for (const key of ["groupFieldId", "dateFieldId", "endDateFieldId"]) {
      const error = resolve(key, null, fields, "field");
      if (error) return { action: next, error };
    }
    for (const key of ["filter", "sort", "filters", "sorts", "aggregations"]) {
      const original = next[key];
      const many = key.endsWith("s");
      const entries = many ? original : original == null ? [] : [original];
      if (!Array.isArray(entries)) continue;
      const resolved: WorkspaceJson[] = [];
      for (const rawCondition of entries) {
        const condition = object(rawCondition);
        if (!condition) { resolved.push(rawCondition as WorkspaceJson); continue; }
        const target = matchIdOrName(fields, condition.fieldId, "field");
        if (target.error) return { action: next, error: target.error };
        resolved.push({ ...condition, fieldId: target.id });
      }
      if (many) next[key] = resolved;
      else if (resolved.length) next[key] = resolved[0];
    }
  }
  return { action: next };
}
