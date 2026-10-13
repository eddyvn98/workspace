import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const name = { type: "string", minLength: 1, maxLength: 31 } as const;
const data = {
  type: "object", additionalProperties: false,
  properties: {
    rows: { type: "integer", minimum: 1, maximum: 500 }, cols: { type: "integer", minimum: 1, maximum: 200 },
    cells: { type: "array", maxItems: 500, items: { type: "array", maxItems: 200, items: { type: "string", maxLength: 10_000, nullable: true } } },
    formulas: { type: "array", maxItems: 500, items: { type: "array", maxItems: 200, items: { type: "string", maxLength: 1000, nullable: true } } },
  },
} as const;
const selector = { sheetId: id, sheetName: name } as const;

export const WORKSPACE_RUNTIME_TABLE_WORKBOOK_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  add_table_sheet: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "name"],
    properties: { type: { type: "string", const: "add_table_sheet" }, blockId: id, name, data, activate: { type: "boolean" } },
  },
  rename_table_sheet: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "name"],
    properties: { type: { type: "string", const: "rename_table_sheet" }, blockId: id, ...selector, name },
  },
  duplicate_table_sheet: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "name"],
    properties: { type: { type: "string", const: "duplicate_table_sheet" }, blockId: id, ...selector, name, activate: { type: "boolean" } },
  },
  delete_table_sheet: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: { type: { type: "string", const: "delete_table_sheet" }, blockId: id, ...selector },
  },
  reorder_table_sheets: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "sheetIds"],
    properties: { type: { type: "string", const: "reorder_table_sheets" }, blockId: id, sheetIds: { type: "array", minItems: 1, maxItems: 500, items: id } },
  },
  select_table_sheet: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: { type: { type: "string", const: "select_table_sheet" }, blockId: id, ...selector },
  },
};
