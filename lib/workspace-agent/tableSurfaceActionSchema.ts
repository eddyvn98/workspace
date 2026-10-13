import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const block = { blockId: id, sheetId: id, sheetName: { type: "string", minLength: 1, maxLength: 31 } } as const;
const rowIndex = { type: "integer", minimum: 0, maximum: 2000 } as const;
const colIndex = { type: "integer", minimum: 0, maximum: 100 } as const;
const textGrid = { type: "array", maxItems: 2000, items: { type: "array", maxItems: 100, items: { type: "string", maxLength: 10_000 } } } as const;

export const WORKSPACE_RUNTIME_TABLE_SURFACE_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  update_table_options: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: { type: { type: "string", const: "update_table_options" }, ...block, headerRow: { type: "boolean" }, headerCol: { type: "boolean" }, mode: { type: "string", enum: ["document", "spreadsheet"] } },
  },
  move_table_row: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "from", "to"],
    properties: { type: { type: "string", const: "move_table_row" }, ...block, from: rowIndex, to: rowIndex },
  },
  move_table_column: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "from", "to"],
    properties: { type: { type: "string", const: "move_table_column" }, ...block, from: colIndex, to: colIndex },
  },
  duplicate_table_row: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: { type: { type: "string", const: "duplicate_table_row" }, ...block, row: rowIndex, index: rowIndex, count: { type: "integer", minimum: 1, maximum: 100 } },
  },
  duplicate_table_column: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: { type: { type: "string", const: "duplicate_table_column" }, ...block, column: colIndex, index: colIndex, count: { type: "integer", minimum: 1, maximum: 100 } },
  },
  paste_table_range: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: { type: { type: "string", const: "paste_table_range" }, ...block, row: rowIndex, column: colIndex, col: colIndex, text: { type: "string", maxLength: 200_000 }, values: textGrid },
  },
  import_table: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: {
      type: { type: "string", const: "import_table" }, ...block,
      text: { type: "string", maxLength: 200_000 }, content: { type: "string", maxLength: 200_000 }, data: { type: "string", maxLength: 200_000 },
      format: { type: "string", enum: ["csv", "tsv", "markdown"] }, append: { type: "boolean" }, headerRow: { type: "boolean" },
    },
  },
  sort_table_range: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: {
      type: { type: "string", const: "sort_table_range" }, ...block, range: { type: "string", maxLength: 64 },
      column: colIndex, col: colIndex, direction: { type: "string", enum: ["asc", "desc"] }, dir: { type: "string", enum: ["asc", "desc"] }, hasHeader: { type: "boolean" },
    },
  },
};
