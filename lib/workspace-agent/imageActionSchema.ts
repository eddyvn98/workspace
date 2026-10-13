import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const image = { type: "string", minLength: 1, maxLength: 2000 } as const;
const attachments = { type: "array", maxItems: 40, items: {
  type: "object", additionalProperties: false, required: ["url"],
  properties: { url: image, alt: { type: "string", maxLength: 500 } },
} } as const;

export const WORKSPACE_RUNTIME_IMAGE_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  update_image: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: {
      type: { type: "string", const: "update_image" }, blockId: id,
      image, url: image, alt: { type: "string", maxLength: 500 }, images: attachments,
      removeImageIndex: { type: "integer", minimum: 0, maximum: 39 },
    },
  },
  update_icon: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "icon"],
    properties: { type: { type: "string", const: "update_icon" }, blockId: id, icon: { type: "string", minLength: 1, maxLength: 128 } },
  },
};
