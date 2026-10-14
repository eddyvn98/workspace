import type { WorkspaceJson } from "./contracts";
import { COLLECTION_COMMANDS } from "./collectionActionSchema";
import type { CollectionBlockPayload, CollectionField, CollectionFieldType } from "@/app/workspace/collections/model";
import { validCollectionExpression } from "@/app/workspace/collections/collectionFormulaExpression";
import { relationValueValid } from "@/app/workspace/collections/collectionRelations";
import { isValidFilterOperator, validOperator } from "@/app/workspace/collections/collectionFilters";

const obj = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const str = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const fieldTypes = new Set(["text", "number", "date", "select", "checkbox", "url", "image", "relation", "lookup", "rollup", "formula"]);
const viewKinds = new Set(["table", "kanban", "calendar", "timeline", "gallery", "mindmap", "form"]);
const reserved = new Set(["__proto__", "prototype", "constructor"]);

/** Collection cells persist strings, but a model may emit JSON numbers or booleans. */
export function normalizeCollectionValue(value: unknown): string | null {
  if (typeof value === "string") return value.length <= 2000 ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
}

function validValue(field: CollectionField, value: string): boolean {
  if (value.length > 2000) return false;
  if (!value) return true;
  if (["lookup", "formula", "rollup"].includes(field.type)) return false;
  if (field.type === "relation") return value.length <= 2000;
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
      || Object.entries(values).some(([id, value]) => reserved.has(id) || !str(id) || id.length > 128 || normalizeCollectionValue(value) === null)) {
      return `${type}.values must contain 1–100 field IDs with strings, finite numbers or booleans (max 2000 characters each).`;
    }
  }
  if ("options" in action && !validOptions(action.options)) return `${type}.options must contain distinct non-empty strings.`;
  if ("fieldType" in action && !fieldTypes.has(String(action.fieldType))) return `${type}.fieldType is invalid.`;
  if ("kind" in action && !viewKinds.has(String(action.kind))) return `${type}.kind is invalid.`;
  if (type === "update_collection_field" && !["name", "fieldType", "options", "relationFieldId", "targetFieldId", "formulaOperation", "formulaFieldIds", "formulaExpression", "rollupOperation", "relationMultiple", "relationTargetBlockId"].some((key) => key in action)) return "No Collection field changes specified.";
  if (type === "configure_collection_view" && !["name", "active", "groupFieldId", "dateFieldId", "endDateFieldId", "filter", "sort", "filters", "sorts", "filterLogic", "aggregations", "galleryFieldIds", "formFieldIds", "formRequiredFieldIds"].some((key) => key in action)) return "No Collection view changes specified.";
  if ("filterLogic" in action && action.filterLogic !== "and" && action.filterLogic !== "or") return "Invalid Collection filterLogic.";
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
    if (nextType === "formula") {
      const op = action.formulaOperation ?? field?.formulaOperation;
      const sources = action.formulaFieldIds ?? field?.formulaFieldIds;
      if (!["sum", "subtract", "multiply", "divide", "average", "concat", "expression"].includes(String(op)))
        return "Formula requires a supported formulaOperation.";
      if (op === "expression") {
        const expression = action.formulaExpression ?? field?.formulaExpression;
        if (typeof expression !== "string" || !validCollectionExpression(expression, data, String(action.fieldId)))
          return "Expression must be bounded arithmetic with numeric {fieldId} references.";
      } else {
        if (!Array.isArray(sources) || sources.length < 2 || sources.length > 10 ||
          sources.some(id => !data.fields.some(f => f.id === id && f.type !== "formula")))
          return "Formula requires 2–10 existing non-formula field IDs.";
        if (["subtract", "divide"].includes(String(op)) && sources.length !== 2)
          return "Formula operation requires exactly two fields.";
        if (op !== "concat" && sources.some(id => !data.fields.some(f =>
          f.id === id && ["number", "lookup", "rollup"].includes(f.type))))
          return "Numeric formula fields must be numbers or computed numeric values.";
      }
    }
    if (nextType === "lookup" || nextType === "rollup") {
      const relationId = action.relationFieldId ?? field?.relationFieldId;
      const targetId = action.targetFieldId ?? field?.targetFieldId;
      const relation = data.fields.find(f => f.id === relationId && f.type === "relation");
      const sourceBlock = relation?.relationTargetBlockId ? obj(obj(board.blocks)?.[relation.relationTargetBlockId]) : null;
      const sourceData = sourceBlock?.type === "collection" ? obj(sourceBlock.data) as unknown as CollectionBlockPayload : data;
      if (!data.fields.some(f => f.id === relationId && f.type === "relation")) return "Lookup requires an existing relationFieldId.";
      if (nextType !== "rollup" || (action.rollupOperation ?? field?.rollupOperation) !== "count") {
        if (!sourceData.fields.some(f => f.id === targetId && !["lookup", "rollup", "formula", "relation"].includes(f.type)))
          return "Computed relation requires an existing source field.";
      }
      if (nextType === "rollup") {
        const op = action.rollupOperation ?? field?.rollupOperation;
        if (!["sum", "average", "min", "max", "count"].includes(String(op))) return "Invalid rollup operation.";
        if (op !== "count" && !sourceData.fields.some(f => f.id === targetId && f.type === "number"))
          return "Numeric rollups require a number source field.";
      }
    }
    if (nextType === "relation" && (action.relationTargetBlockId || field?.relationTargetBlockId)) {
      const targetBlockId = String(action.relationTargetBlockId ?? field?.relationTargetBlockId);
      const targetBlock = obj(obj(board.blocks)?.[targetBlockId]);
      if (!targetBlock || targetBlock.type !== "collection") return "Relation target must be a Collection block on this board.";
    }
    if (nextType === "relation" && action.relationMultiple === false && data.records.some(record =>
      (record.values[String(action.fieldId)] ?? "").startsWith("[")))
      return "Remove multi-link values before disabling multiple links.";
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
      if (!targetField || ["lookup", "formula", "rollup"].includes(targetField.type) || !validValue(targetField, String(value)))
        return `Unknown, computed or invalid fieldId/value: ${id}.`;
      if (targetField.type === "relation" && !relationValueValid(data, targetField, String(value),
        Object.fromEntries(Object.entries(obj(board.blocks)).filter(([, block]) => obj(block)?.type === "collection")
          .map(([id, block]) => [id, obj(obj(block)?.data) as unknown as CollectionBlockPayload]))))
        return `Unknown related recordId: ${String(value).slice(0, 128)}.`;
    }
  }
  if (type === "configure_collection_view") {
    // Validate field layout changes against the proposed state, not only persisted arrays.
    const fieldIds = ["galleryFieldIds", "formFieldIds", "formRequiredFieldIds"] as const;
    for (const key of fieldIds) {
      if (!(key in action)) continue;
      const ids = action[key];
      if (!Array.isArray(ids) || ids.length > 100 || new Set(ids).size !== ids.length ||
        ids.some(id => typeof id !== "string" || !data.fields.some(field => field.id === id))) {
        return "Invalid or duplicate Collection " + key + ".";
      }
      if (key !== "galleryFieldIds" && ids.some(id => data.fields.some(field => field.id === id
        && (["formula", "lookup", "rollup"].includes(field.type))))) {
        return "Form fields cannot be computed.";
      }
      if (key === "galleryFieldIds" && view?.kind !== "gallery") return "Gallery fields require a Gallery view.";
      if (key !== "galleryFieldIds" && view?.kind !== "form") return "Form fields require a Form view.";
    }
    if (view?.kind === "form") {
      const eligible = data.fields.filter(field => field.type !== "lookup" && field.type !== "formula").map(field => field.id);
      const visible = action.formFieldIds ?? view.formFieldIds ?? eligible;
      const required = action.formRequiredFieldIds ?? view.formRequiredFieldIds ?? [data.fields[0]?.id];
      if (!Array.isArray(visible) || !Array.isArray(required) ||
        required.some(id => !visible.includes(id))) return "Required form fields must be visible.";
    }
    for (const [key, expectedType] of [["groupFieldId", "select"], ["dateFieldId", "date"], ["endDateFieldId", "date"]]) {
      const id = action[key];
      if (id !== undefined && id !== null && !data.fields.some((f) => f.id === id && f.type === expectedType)) return `${key} must identify an existing ${expectedType} field.`;
    }
    if ("filterLogic" in action && action.filterLogic !== "and" && action.filterLogic !== "or") return "Invalid Collection filterLogic.";
    if ("aggregations" in action) {
      const items = action.aggregations;
      if (!Array.isArray(items) || items.length > 20) return "Invalid Collection aggregations.";
      const used = new Set<string>();
      for (const raw of items) {
        const item = obj(raw);
        const id = item?.fieldId;
        if (typeof id !== "string" || used.has(id) || !data.fields.some(f => f.id === id))
          return "Invalid or duplicate Collection aggregation fieldId.";
        used.add(id);
        if (!["sum", "average", "min", "max", "count"].includes(String(item?.operation)))
          return "Invalid Collection aggregate operation.";
        if (item?.operation !== "count" && !data.fields.some(f => f.id === id && ["number", "formula", "rollup"].includes(f.type)))
          return "Aggregation requires numeric field or count.";
      }
    }
    for (const key of ["filter", "sort", "filters", "sorts"] as const) {
      const items = key.endsWith("s") ? (action[key] ?? []) : action[key] == null ? [] : [action[key]];
      if (!Array.isArray(items) || items.length > 20) return `${key} requires at most 20 conditions.`;
      const used = new Set<string>();
      for (const raw of items) {
        const config = obj(raw);
        const fieldId = config?.fieldId;
        if (typeof fieldId !== "string" || !data.fields.some((f) => f.id === fieldId)) return `${key}.fieldId must identify an existing field.`;
        if (used.has(fieldId) && (key === "sort" || key === "sorts")) return `Duplicate ${key}.fieldId is not supported.`;
        used.add(fieldId);
        if (key === "filter" || key === "filters") {
          const field = data.fields.find((f) => f.id === fieldId)!;
          const operator = config!.operator ?? "eq";
          if (!validOperator(operator) || !isValidFilterOperator(field.type, operator)) return "Invalid Collection filter operator for field type.";
          const typed = ["eq", "neq", "gt", "gte", "lt", "lte"].includes(operator);
          if (typeof config!.value !== "string" || config!.value.length > 2000 ||
            (typed && !validValue(field, config!.value))) return "Invalid Collection filter value."; 
        } else if (config!.direction !== "asc" && config!.direction !== "desc") return "Invalid Collection sort direction.";
      }
    }
  }
  return null;
}
