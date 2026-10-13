import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const confirm = { type: "boolean", enum: [true] } as const;
const email = { type: "string", minLength: 3, maxLength: 320 } as const;
const blockIds = { type: "array", maxItems: 500, items: id } as const;

export const WORKSPACE_RUNTIME_BOARD_MANAGEMENT_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  list_versions: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: { type: { type: "string", const: "list_versions" } },
  },
  create_version: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: { type: { type: "string", const: "create_version" }, label: { type: "string", maxLength: 120 } },
  },
  export_board: {
    type: "object", additionalProperties: false, required: ["type", "format"],
    properties: {
      type: { type: "string", const: "export_board" },
      format: { type: "string", enum: ["markdown", "json", "opml", "pdf", "pptx"] },
      blockIds,
    },
  },
  import_markdown: {
    type: "object", additionalProperties: false, required: ["type", "markdown", "baseRevision"],
    properties: {
      type: { type: "string", const: "import_markdown" },
      markdown: { type: "string", minLength: 1, maxLength: 200_000 },
      baseRevision: { type: "integer", minimum: 0 },
    },
  },
  list_shares: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: { type: { type: "string", const: "list_shares" } },
  },
  restore_version: {
    type: "object", additionalProperties: false, required: ["type", "snapshotId", "baseRevision", "confirm"],
    properties: {
      type: { type: "string", const: "restore_version" }, snapshotId: id,
      baseRevision: { type: "integer", minimum: 0 }, confirm,
    },
  },
  share_board: {
    type: "object", additionalProperties: false, required: ["type", "email", "role", "confirm"],
    properties: {
      type: { type: "string", const: "share_board" }, email,
      role: { type: "string", enum: ["VIEWER", "EDITOR"] }, confirm,
    },
  },
  remove_share: {
    type: "object", additionalProperties: false, required: ["type", "email", "confirm"],
    properties: { type: { type: "string", const: "remove_share" }, email, confirm },
  },
  set_public_link: {
    type: "object", additionalProperties: false, required: ["type", "enabled", "confirm"],
    properties: {
      type: { type: "string", const: "set_public_link" }, enabled: { type: "boolean" },
      expiration: { type: "string", maxLength: 64, nullable: true }, confirm,
    },
  },
};
