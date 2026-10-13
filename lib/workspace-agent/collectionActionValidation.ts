import type { WorkspaceJson } from "./contracts";
import { COLLECTION_COMMANDS } from "./collectionActionSchema";
import type { CollectionBlockPayload, CollectionField, CollectionFieldType } from "@/app/workspace/collections/model";

const obj = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const str = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const fieldTypes = new Set(["text", "number", "date", "select", "checkbox", "url", "image"]);
const viewKinds = new Set(["table", "kanban", "calendar", "timeline", "gallery", "mindmap"]);
const reserved = new Set(["__proto__", "prototype", "constructor"]);

function validValue(field: CollectionField, value: string): boolean {
  if (value.length > 2000) return false;
  if (!value) return true;
  if (field.type === "checkbox") return value === "true" || value === "false";
  if (field.type === "select") return (field.options ?? []).includes(value);
  if (field.type === "number") return Number.isFinite(Number(value));
  if (field.type === "date") return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
  if (field.type === "url") return /^https?:\/\/[^\s]+$/i.test(value);
  return true;
}

function validOptions(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 60
    && value.every((item) => str(item) && item.length <= 160)
    && new Set(value.map((item: string) => item.trim().toLocaleLowerCase())).size === value.length;
}

export function validateCollectionAction(action: Record<string, unknown>): string | null {
  const type = String(action.type ?? "");
  if (!COLLECTION_COMMANDS.has(type)) return null;
  if (!str(action.blockId)) return `${type} requires exact blockId.`;
  for (const key of ["recordId", "fieldId", "viewId"]) {
    if (key in action && (!str(action[key]) || (action[key] as string).length > 128)) return `${type} requires exact ${key}.`;
  }
  if ("values" in action) {
    const values = obj(action.values);
    if (!values || Object.keys(values).length < 1 || Object.keys(values).length > 100
      || Object.entries(values).some(([id, value]) => reserved.has(id) || !str(id) || id.length > 128 || typeof value !== "string" || value.length > 2000)) {
      return `${type}.values must contain 1–100 fieldId:string pairs.`;
    }
  }
  if ("options" in action && !validOptions(action.options)) return `${type}.options must contain distinct non-empty strings.`;
  if ("fieldType" in action && !fieldTypes.has(String(action.fieldType))) return `${type}.fieldType is invalid.`;
  if ("kind" in action && !viewKinds.has(String(action.kind))) return `${type}.kind is invalid.`;
  if (type === "update_collection_field" && !["name", "fieldType", "options"].some((key) => key in action)) return "No Collection field changes specified.";
  if (type === "configure_collection_view" && !["name", "active", "groupFieldId", "dateFieldId", "endDateFieldId", "filter", "sort"].some((key) => key in action)) return "No Collection view changes specified.";
  if ("name" in action && (!str(action.name) || String(action.name).length > 160)) return `${type}.name must be non-empty.`;
  return null;
}

/** Model-step and executor both validate against exact persisted IDs, never display names. */
export function validateCollectionTarget(action: WorkspaceJson, board: WorkspaceJson): string | null {
  const type = String(action.type ?? "");
  if (!COLLECTION_COMMANDS.has(type)) return null;
  const block = obj(obj(board.blocks)?.[String(action.blockId)]);
  if (!block || block.type !== (type === "convert_table_to_collection" ? "table" : "collection")) {
    return `${type} requires exact blockId of a ${type === "convert_table_to_collection" ? "table" : "collection"} block.`;
  }
  if (type === "convert_table_to_collection") {
    const table = obj(block.data);
    if (!table || !Number.isInteger(table.rows) || !Number.isInteger(table.cols)
      || Number(table.rows) > 5000 || Number(table.cols) > 50 || Number(table.rows) < 1 || Number(table.cols) < 1) {
      return "Table dimensions exceed the safe Collection conversion limit.";
    }
    return null;
  }
  const data = obj(block.data) as unknown as CollectionBlockPayload | null;
  if (!data || !Array.isArray(data.fields) || !Array.isArray(data.records) || !Array.isArray(data.views)) return "Invalid Collection block data.";
  const field = data.fields.find((f) => f.id === action.fieldId);
  const record = data.records.find((r) => r.id === action.recordId);
  const view = data.views.find((v) => v.id === action.viewId);
  if ("viewId" in action && type !== "add_collection_view" && !view) return "Unknown viewId. Read Collection views for exact IDs.";
  if ("fieldId" in action && type !== "add_collection_field" && !field) return "Unknown fieldId. Read Collection fields for exact IDs.";
  if ("recordId" in action && type !== "create_collection_record" && !record) return "Unknown recordId. Read or search Collection records for exact IDs.";
  if (type === "create_collection_record" && (record || data.records.length >= 5000)) return "recordId already exists or the Collection is full; do not retry with a different recordId.";
  if (type === "add_collection_field" && (field || data.fields.length >= 100 || data.fields.some((f) => f.id === action.fieldId))) return "fieldId is already used or field limit reached.";
  if (type === "add_collection_view" && (view || data.views.length >= 100 || data.views.some((v) => v.id === action.viewId))) return "viewId is already used or view limit reached.";
  if (type === "remove_collection_field" && (data.fields.length <= 1 || data.fields[0]?.id === action.fieldId)) return "Cannot remove the only or primary Collection field.";
  if (type === "remove_collection_view" && data.views.length <= 1) return "Cannot remove the last Collection view.";
  if (type === "add_collection_field" || type === "update_collection_field") {
    const name = String(action.name ?? field?.name ?? "");
    if (data.fields.some((f) => f.id !== action.fieldId && f.name.toLowerCase() === name.toLowerCase())) return "Ambiguous Collection field name; use a distinct name and exact fieldId.";
    const nextType = String(action.fieldType ?? field?.type ?? "text") as CollectionFieldType;
    if (nextType === "select" && "options" in action && !validOptions(action.options)) return "Invalid select options.";
    if (type === "update_collection_field") {
      const replacement: CollectionField = { ...field!, type: nextType, options: "options" in action ? action.options as string[] : field!.options };
      if (data.records.some((r) => !validValue(replacement, r.values[field!.id] ?? ""))) return "Existing values are incompatible with the new field type/options.";
    }
  }
  if (type === "add_collection_view" && data.views.some((v) => v.name.toLowerCase() === String(action.name).toLowerCase())) return "View name is ambiguous.";
  if (type === "configure_collection_view" && "name" in action && data.views.some((v) => v.id !== view?.id && v.name.toLowerCase() === String(action.name).toLowerCase())) return "View name is ambiguous.";
  if ("values" in action) {
    const values = obj(action.values) ?? {};
    for (const [id, value] of Object.entries(values)) {
      const targetField = data.fields.find((f) => f.id === id);
      if (!targetField || !validValue(targetField, String(value))) return `Unknown fieldId or invalid value: ${id}.`;
    }
  }
  if (type === "configure_collection_view") {
    for (const [key, expectedType] of [["groupFieldId", "select"], ["dateFieldId", "date"], ["endDateFieldId", "date"]]) {
      const id = action[key];
      if (id !== undefined && id !== null && !data.fields.some((f) => f.id === id && f.type === expectedType)) return `${key} must identify an existing ${expectedType} field.`;
    }
    for (const key of ["filter", "sort"]) {
      const config = obj(action[key]);
      if (config && !data.fields.some((f) => f.id === config.fieldId)) return `${key}.fieldId must identify an existing field.`;
      if (key === "filter" && config) {
        const targetField = data.fields.find((f) => f.id === config.fieldId)!;
        if (typeof config.value !== "string" || !validValue(targetField, config.value)) return "Invalid Collection filter value.";
      }
    }
  }
  return null;
}
