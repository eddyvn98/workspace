import type { PropertySchema, RuntimeActionSchema } from "./actionSchema";

const id: PropertySchema = { type: "string", minLength: 1, maxLength: 128 };
const word: PropertySchema = { type: "string", minLength: 1, maxLength: 160 };
const values: PropertySchema = { type: "object", additionalProperties: true };
const fieldType: PropertySchema = { type: "string", enum: ["text", "number", "date", "select", "checkbox", "url", "image", "relation", "lookup"] };
const viewKind: PropertySchema = { type: "string", enum: ["table", "kanban", "calendar", "timeline", "gallery", "mindmap"] };
const options: PropertySchema = { type: "array", maxItems: 60, items: { type: "string", minLength: 1, maxLength: 160 } };
const filterOperator: PropertySchema = { type: "string", enum: ["eq", "neq", "contains", "not_contains", "gt", "gte", "lt", "lte", "empty", "not_empty"] };
const filterLogic: PropertySchema = { type: "string", enum: ["and", "or"] };
const filter: PropertySchema = { type: "object", nullable: true, additionalProperties: false,
  required: ["fieldId", "value"], properties: { fieldId: id, value: { type: "string", maxLength: 2000 }, operator: filterOperator } };
const sort: PropertySchema = { type: "object", nullable: true, additionalProperties: false,
  required: ["fieldId", "direction"], properties: { fieldId: id, direction: { type: "string", enum: ["asc", "desc"] } } };

const filters: PropertySchema = { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false,
  required: ["fieldId", "value"], properties: { fieldId: id, value: { type: "string", maxLength: 2000 }, operator: filterOperator } } };
const sorts: PropertySchema = { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false,
  required: ["fieldId", "direction"], properties: { fieldId: id, direction: { type: "string", enum: ["asc", "desc"] } } } };
function define(name: string, required: string[], properties: Record<string, PropertySchema> = {}): RuntimeActionSchema {
  return { type: "object", additionalProperties: false, required: ["type", "blockId", ...required],
    properties: { type: { type: "string", const: name }, blockId: id, ...properties } };
}

/** Explicit bounded contracts; no free-form Workspace mutation or model-side tool executor. */
export const WORKSPACE_RUNTIME_COLLECTION_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  read_collection: define("read_collection", [], { viewId: id, limit: { type: "integer", minimum: 1, maximum: 30 } }),
  search_collection_records: define("search_collection_records", ["query"], {
    query: { type: "string", minLength: 1, maxLength: 200 }, viewId: id, limit: { type: "integer", minimum: 1, maximum: 30 } }),
  create_collection_record: define("create_collection_record", ["recordId", "values"], { recordId: id, values }),
  update_collection_record: define("update_collection_record", ["values"], { recordId: id, recordName: word, values }),
  delete_collection_record: define("delete_collection_record", [], { recordId: id, recordName: word }),
  add_collection_field: define("add_collection_field", ["fieldId", "name", "fieldType"], {
    fieldId: id, name: word, fieldType, options, relationFieldId: id, targetFieldId: id }),
  update_collection_field: define("update_collection_field", [], {
    fieldId: id, fieldName: word, name: word, fieldType, options, relationFieldId: { ...id, nullable: true }, targetFieldId: { ...id, nullable: true } }),
  remove_collection_field: define("remove_collection_field", [], { fieldId: id, fieldName: word }),
  add_collection_view: define("add_collection_view", ["viewId", "name", "kind"], {
    viewId: id, name: word, kind: viewKind }),
  configure_collection_view: define("configure_collection_view", [], {
    viewId: id, viewName: word, name: word, active: { type: "boolean" }, groupFieldId: { ...id, nullable: true },
    dateFieldId: { ...id, nullable: true }, endDateFieldId: { ...id, nullable: true }, filter, sort, filters, sorts, filterLogic }),
  remove_collection_view: define("remove_collection_view", [], { viewId: id, viewName: word }),
  convert_table_to_collection: define("convert_table_to_collection", []),
};

export const COLLECTION_READ_COMMANDS = new Set(["read_collection", "search_collection_records"]);
export const COLLECTION_COMMANDS = new Set(Object.keys(WORKSPACE_RUNTIME_COLLECTION_ACTION_SCHEMAS));
