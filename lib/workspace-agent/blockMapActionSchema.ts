import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const numeric = { type: "number", minimum: -1_000_000, maximum: 1_000_000 } as const;
const mapTarget = { type: "object", additionalProperties: false, properties: { id, nodeId: id, blockId: id, topic: { type: "string", maxLength: 500 }, name: { type: "string", maxLength: 500 }, text: { type: "string", maxLength: 500 }, label: { type: "string", maxLength: 500 } } } as const;
const blockType = { type: "string", enum: ["text", "image", "link", "doc", "table", "slideDeck", "shape", "sticky", "sticky_note"] } as const;

export const WORKSPACE_RUNTIME_BLOCK_MAP_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  create_block: { type: "object", additionalProperties: false, required: ["type"], properties: {
    type: { type: "string", const: "create_block" }, blockType, id, block: { type: "object", additionalProperties: true },
    data: { type: "object", additionalProperties: true }, style: { type: "object", additionalProperties: true },
    text: { type: "string", maxLength: 20_000 }, url: { type: "string", maxLength: 2000 }, markdown: { type: "string", maxLength: 20_000 }, html: { type: "string", maxLength: 20_000 },
    width: { type: "number", minimum: 1, maximum: 100_000 }, height: { type: "number", minimum: 1, maximum: 100_000 }, w: { type: "number", minimum: 1, maximum: 100_000 }, h: { type: "number", minimum: 1, maximum: 100_000 },
    x: numeric, y: numeric, rotation: numeric, zIndex: numeric, parentId: id, shapeType: { type: "string", maxLength: 64 },
  } },
  duplicate_map: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", const: "duplicate_map" }, blockId: id, target: { type: "string", minLength: 1, maxLength: 500 }, nodeId: id, shapeId: id } },
  copy_branch_to_map: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", const: "copy_branch_to_map" }, blockId: id, target: { type: "string", minLength: 1, maxLength: 500 }, nodeId: id, shapeId: id } },
};
