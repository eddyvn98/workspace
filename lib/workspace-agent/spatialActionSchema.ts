import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const ids = { type: "array", minItems: 1, maxItems: 500, items: id } as const;
const number = { type: "number", minimum: -1_000_000, maximum: 1_000_000 } as const;
const transform = {
  type: "object", additionalProperties: false,
  properties: { x: number, y: number, w: number, width: number, h: number, height: number, rotation: number, zIndex: number },
} as const;

export const WORKSPACE_RUNTIME_SPATIAL_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  update_transform: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: {
      type: { type: "string", const: "update_transform" }, blockId: id, transform,
      x: number, y: number, w: number, width: number, h: number, height: number, rotation: number, zIndex: number,
      placement: { type: "string", enum: ["left", "right", "above", "below"] }, relativeToBlockId: id,
      gap: { type: "number", minimum: 0, maximum: 500 },
    },
  },
  update_z_order: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: {
      type: { type: "string", const: "update_z_order" }, blockId: id,
      zOrder: { type: "string", enum: ["front", "forward", "back", "backward"] },
      order: { type: "string", enum: ["front", "forward", "back", "backward"] },
      action: { type: "string", enum: ["front", "forward", "back", "backward"] },
    },
  },
  search_replace: {
    type: "object", additionalProperties: false, required: ["type", "query"],
    properties: {
      type: { type: "string", const: "search_replace" }, query: { type: "string", minLength: 1, maxLength: 1000 },
      replacement: { type: "string", maxLength: 10_000 }, replaceAll: { type: "boolean" }, blockIds: ids, ids,
    },
  },
  arrange_selection: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: {
      type: { type: "string", const: "arrange_selection" }, blockIds: { ...ids, minItems: 2 }, ids: { ...ids, minItems: 2 },
      mode: { type: "string", enum: ["catalog", "grid", "row", "column", "align_left", "align_center", "align_right", "align_top", "align_middle", "align_bottom", "distribute_horizontal", "distribute_vertical"] },
      layout: { type: "string", enum: ["catalog", "grid", "row", "column", "align_left", "align_center", "align_right", "align_top", "align_middle", "align_bottom", "distribute_horizontal", "distribute_vertical"] },
      gap: { type: "number", minimum: 0, maximum: 10_000 },
      columns: { type: "integer", minimum: 1, maximum: 500 },
    },
  },
  reorder_nodes: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "nodes"],
    properties: { type: { type: "string", const: "reorder_nodes" }, blockId: id, nodes: { type: "array", minItems: 1, maxItems: 500 } },
  },
  replace_children: {
    type: "object", additionalProperties: false, required: ["type", "blockId", "nodes"],
    properties: { type: { type: "string", const: "replace_children" }, blockId: id, nodes: { type: "array", minItems: 1, maxItems: 500 } },
  },
};
