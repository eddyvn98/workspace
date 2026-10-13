import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const point = { type: "object", additionalProperties: false, required: ["x", "y"], properties: {
  x: { type: "number", minimum: -1_000_000, maximum: 1_000_000 }, y: { type: "number", minimum: -1_000_000, maximum: 1_000_000 },
} } as const;
const target = { blockId: id, shapeId: id, strokeId: id, target: id, id };
const style = { type: "object", additionalProperties: false, properties: {
  backgroundColor: { type: "string", maxLength: 64 }, backgroundOpacity: { type: "number", minimum: 0, maximum: 100 },
  borderColor: { type: "string", maxLength: 64 }, borderWidth: { type: "number", enum: [1, 1.5, 2, 3] }, borderDash: { type: "string", enum: ["solid", "dashed", "dotted"] },
  textColor: { type: "string", maxLength: 64 }, fontSize: { type: "number", minimum: 8, maximum: 96 }, fontWeight: { type: "string", enum: ["normal", "bold"] },
  fontStyle: { type: "string", enum: ["normal", "italic"] }, align: { type: "string", enum: ["left", "center", "right"] }, verticalAlign: { type: "string", enum: ["top", "middle", "bottom"] },
} } as const;
const shapeFields = {
  shapeType: { type: "string", enum: ["rectangle", "rounded_rect", "rounded", "box", "ellipse", "oval", "circle", "diamond", "triangle", "hexagon", "star", "pill", "parallelogram", "sticky", "sticky_note"] },
  shapeKind: { type: "string", enum: ["rectangle", "rounded_rect", "rounded", "box", "ellipse", "oval", "circle", "diamond", "triangle", "hexagon", "star", "pill", "parallelogram", "sticky", "sticky_note"] },
  text: { type: "string", maxLength: 4000 }, label: { type: "string", maxLength: 4000 }, style,
  x: { type: "number", minimum: -1_000_000, maximum: 1_000_000 }, y: { type: "number", minimum: -1_000_000, maximum: 1_000_000 },
  width: { type: "number", minimum: 1, maximum: 100_000 }, height: { type: "number", minimum: 1, maximum: 100_000 },
  rotation: { type: "number", minimum: -3600, maximum: 3600 },
};

export const WORKSPACE_RUNTIME_SHAPE_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  create_shape: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", const: "create_shape" }, ...shapeFields } },
  update_shape: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", const: "update_shape" }, ...target, ...shapeFields } },
  delete_shape: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", const: "delete_shape" }, ...target } },
  duplicate_shape: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", const: "duplicate_shape" }, ...target, count: { type: "integer", minimum: 1, maximum: 20 }, copies: { type: "integer", minimum: 1, maximum: 20 }, offsetX: { type: "number", minimum: -100_000, maximum: 100_000 }, offsetY: { type: "number", minimum: -100_000, maximum: 100_000 } } },
  create_freehand: { type: "object", additionalProperties: false, required: ["type", "points"], properties: { type: { type: "string", const: "create_freehand" }, points: { type: "array", minItems: 2, maxItems: 500, items: point }, color: { type: "string", maxLength: 64 }, strokeWidth: { type: "number", minimum: 0.1, maximum: 100 }, width: { type: "number", minimum: 16, maximum: 100_000 }, height: { type: "number", minimum: 16, maximum: 100_000 }, x: shapeFields.x, y: shapeFields.y, tool: { type: "string", enum: ["pen", "highlighter", "marker"] }, opacity: { type: "number", minimum: 0, maximum: 100 } } },
  update_freehand: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", const: "update_freehand" }, ...target, points: { type: "array", minItems: 2, maxItems: 500, items: point }, color: { type: "string", maxLength: 64 }, strokeColor: { type: "string", maxLength: 64 }, strokeWidth: { type: "number", minimum: 0.1, maximum: 100 }, width: { type: "number", minimum: 0.1, maximum: 100 }, tool: { type: "string", enum: ["pen", "highlighter", "marker"] }, opacity: { type: "number", minimum: 0, maximum: 100 } } },
  delete_freehand: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", const: "delete_freehand" }, ...target } },
  duplicate_freehand: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", const: "duplicate_freehand" }, ...target, offsetX: { type: "number", minimum: -100_000, maximum: 100_000 }, offsetY: { type: "number", minimum: -100_000, maximum: 100_000 } } },
};
