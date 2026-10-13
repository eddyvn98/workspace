import type { RuntimeActionSchema } from "./actionSchema";

const blockId = { type: "string", minLength: 1, maxLength: 128 } as const;
const resourceId = { type: "string", minLength: 1, maxLength: 128 } as const;

export const WORKSPACE_RUNTIME_FILE_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  list_files: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: { type: { type: "string", const: "list_files" } },
  },
  add_file_block: {
    type: "object", additionalProperties: false, required: ["type", "resourceId"],
    properties: {
      type: { type: "string", const: "add_file_block" }, resourceId,
      x: { type: "number", minimum: -100000, maximum: 100000 },
      y: { type: "number", minimum: -100000, maximum: 100000 },
      page: { type: "integer", minimum: 1 },
    },
  },
  pin_pdf_page: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "page"],
    properties: {
      type: { type: "string", const: "pin_pdf_page" }, blockId,
      page: { type: "integer", minimum: 1 },
    },
  },
};
