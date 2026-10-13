import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const block = { blockId: id, sheetId: id, sheetName: { type: "string", minLength: 1, maxLength: 31 } } as const;
const range = { type: "string", minLength: 1, maxLength: 64 } as const;
const index = { type: "integer", minimum: 0, maximum: 2000 } as const;
const formatFields = {
  range, clear: { type: "boolean" },
  rule: { type: "string", enum: ["gt", "lt", "equal", "text_contains", "between", "duplicate", "colorscale"] },
  value: { type: "string", maxLength: 500 }, value1: { type: "string", maxLength: 500 }, value2: { type: "string", maxLength: 500 },
  values: { type: "array", maxItems: 100, items: { type: "string", maxLength: 500 } },
  backgroundColor: { type: "string", maxLength: 64 }, bgColor: { type: "string", maxLength: 64 }, textColor: { type: "string", maxLength: 64 },
} as const;

export const WORKSPACE_RUNTIME_TABLE_STRUCTURE_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  freeze_table_panes: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: { type: { type: "string", const: "freeze_table_panes" }, ...block, rows: index, columns: index, cols: index },
  },
  hide_table_rows: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: {
      type: { type: "string", const: "hide_table_rows" }, ...block, range,
      indices: { type: "array", minItems: 1, maxItems: 2000, items: index }, hidden: { type: "boolean" },
    },
  },
  hide_table_columns: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: {
      type: { type: "string", const: "hide_table_columns" }, ...block, range,
      indices: { type: "array", minItems: 1, maxItems: 500, items: index }, hidden: { type: "boolean" },
    },
  },
  set_table_validation: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "range"],
    properties: {
      type: { type: "string", const: "set_table_validation" }, ...block, range, clear: { type: "boolean" },
      values: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", minLength: 1, maxLength: 500 } },
    },
  },
  add_table_conditional_format: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "range"],
    properties: { type: { type: "string", const: "add_table_conditional_format" }, ...block, ...formatFields },
  },
  set_table_link: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "row", "column"],
    properties: {
      type: { type: "string", const: "set_table_link" }, ...block, row: index, column: index,
      clear: { type: "boolean" }, url: { type: "string", minLength: 1, maxLength: 2048 }, label: { type: "string", maxLength: 500 },
    },
  },
  set_table_note: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "row", "column"],
    properties: { type: { type: "string", const: "set_table_note" }, ...block, row: index, column: index, clear: { type: "boolean" }, text: { type: "string", minLength: 1, maxLength: 5000 } },
  },
  set_table_sheet_options: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: { type: { type: "string", const: "set_table_sheet_options" }, ...block, color: { type: "string", maxLength: 64 }, hidden: { type: "boolean" } },
  },
};
