import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const ids = { type: "array", minItems: 1, maxItems: 500, items: id } as const;
export const WORKSPACE_RUNTIME_VIEW_CONTAINER_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  focus_view: { type: "object", additionalProperties: false, required: ["type"], properties: {
    type: { type: "string", const: "focus_view" }, mode: { type: "string", enum: ["fit", "focus", "zoom", "pan", "present"] },
    blockId: id, target: id, blockIds: ids, targetIds: ids, ids, fitBlockIds: ids, selectBlockIds: ids,
    frameId: id, frameName: id, slideId: id, zoom: { type: "number", minimum: 0.05, maximum: 8 }, factor: { type: "number", minimum: 0.01, maximum: 100 },
    dx: { type: "number", minimum: -1_000_000, maximum: 1_000_000 }, dy: { type: "number", minimum: -1_000_000, maximum: 1_000_000 }, select: { type: "boolean" },
  } },
  wrap_blocks_in_frame: { type: "object", additionalProperties: false, required: ["type"], properties: {
    type: { type: "string", const: "wrap_blocks_in_frame" }, blockId: id, target: id, targets: ids, targetIds: ids, blockIds: ids, ids, frameId: id,
    mode: { type: "string", enum: ["fit", "add", "remove", "release", "configure"] },
    scope: { type: "string", enum: ["all", "board", "selection"] }, includeDescendants: { type: "boolean" }, movable: { type: "boolean" }, autoMembership: { type: "boolean" },
    title: { type: "string", maxLength: 500 }, text: { type: "string", maxLength: 500 }, label: { type: "string", maxLength: 500 }, color: { type: "string", maxLength: 64 }, padding: { type: "number", minimum: 0, maximum: 10_000 },
    style: { type: "object", additionalProperties: false, properties: { backgroundColor: { type: "string", maxLength: 64 }, borderColor: { type: "string", maxLength: 64 }, borderWidth: { type: "number", minimum: 0, maximum: 32 }, borderDash: { type: "string", enum: ["solid", "dashed", "dotted"] } } },
  } },
};
