import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const ids = { type: "array", minItems: 1, maxItems: 500, items: id } as const;
const camera = {
  type: "object", additionalProperties: false,
  properties: { x: { type: "number" }, y: { type: "number" }, zoom: { type: "number", minimum: 0.000001 }, blockIds: ids, fitBlockIds: ids },
} as const;
const targetProperties = { frameId: id, frameName: id, id, target: id };

export const WORKSPACE_RUNTIME_FRAME_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  create_frame: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: {
      type: { type: "string", const: "create_frame" }, name: { type: "string", maxLength: 200 },
      camera, blockIds: ids, fitBlockIds: ids, presenterNotes: { type: "string", maxLength: 10_000 }, hiddenInPresentation: { type: "boolean" },
    },
  },
  update_frame: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: {
      type: { type: "string", const: "update_frame" }, ...targetProperties,
      name: { type: "string", maxLength: 200 }, camera, blockIds: ids, fitBlockIds: ids,
      presenterNotes: { type: "string", maxLength: 10_000 }, hiddenInPresentation: { type: "boolean" },
    },
  },
  delete_frame: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: { type: { type: "string", const: "delete_frame" }, ...targetProperties },
  },
  reorder_frames: {
    type: "object", additionalProperties: false, required: ["type", "frameIds"],
    properties: { type: { type: "string", const: "reorder_frames" }, frameIds: { type: "array", maxItems: 500, items: id } },
  },
};
