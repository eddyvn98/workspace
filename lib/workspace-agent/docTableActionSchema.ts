import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
export const WORKSPACE_RUNTIME_DOC_TABLE_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  embed_table_in_doc: { type: "object", additionalProperties: false, required: ["type", "docId", "tableId"], properties: { type: { type: "string", const: "embed_table_in_doc" }, docId: id, tableId: id, afterHeading: { type: "string", maxLength: 500 } } },
  set_table_filter: { type: "object", additionalProperties: false, required: ["type", "blockId"], properties: { type: { type: "string", const: "set_table_filter" }, blockId: id, clear: { type: "boolean" }, range: { type: "string", minLength: 1, maxLength: 64 }, column: { type: "integer", minimum: 0, maximum: 499 }, criteria: { type: "object", additionalProperties: true } } },
};
