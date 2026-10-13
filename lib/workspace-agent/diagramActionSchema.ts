import type { RuntimeActionSchema } from "./actionSchema";

const endpoint = { type: "string", minLength: 1, maxLength: 500 } as const;
const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const diagramNode = {
  type: "object", additionalProperties: false,
  properties: {
    id, label: endpoint, topic: endpoint, text: endpoint, name: endpoint,
    role: { type: "string", enum: ["terminator", "process", "decision", "data", "storage", "preparation"] },
    description: { type: "string", maxLength: 4000 },
  },
} as const;
const diagramEdge = {
  type: "object", additionalProperties: false,
  properties: {
    from: endpoint, source: endpoint, to: endpoint, target: endpoint,
    label: { type: "string", maxLength: 300 }, lineLabel: { type: "string", maxLength: 300 },
  },
} as const;
const disconnectSelector = {
  connectorId: id, from: endpoint, fromBlockId: id, to: endpoint, toBlockId: id,
} as const;
const repairSelector = {
  connectorId: id, from: endpoint, source: endpoint, to: endpoint, destination: endpoint,
} as const;
const relationshipPatch = {
  type: "object", additionalProperties: false,
  properties: {
    lineType: { type: "string", enum: ["straight", "curved", "orthogonal", "straight_arrow"] },
    lineDash: { type: "string", enum: ["solid", "dashed", "dotted"] }, lineStyle: { type: "string", enum: ["solid", "dashed", "dotted"] }, dashed: { type: "boolean" },
    lineColor: { type: "string", maxLength: 64 }, strokeColor: { type: "string", maxLength: 64 }, color: { type: "string", maxLength: 64 },
    lineWidth: { type: "number", minimum: 1, maximum: 32 }, strokeWidth: { type: "number", minimum: 1, maximum: 32 },
    arrowStart: { type: "boolean" }, arrowEnd: { type: "boolean" }, lineLabel: { type: "string", maxLength: 300 }, label: { type: "string", maxLength: 300 },
    labelColor: { type: "string", maxLength: 64 }, labelFontSize: { type: "number", minimum: 8, maximum: 72 },
    labelBold: { type: "boolean" }, labelItalic: { type: "boolean" }, labelUnderline: { type: "boolean" }, labelStrikethrough: { type: "boolean" },
    labelBgColor: { type: "string", maxLength: 64 }, labelAlign: { type: "string", enum: ["left", "center", "right"] },
    labelPosition: { type: "number", minimum: 0, maximum: 1 }, labelOrientation: { type: "string", enum: ["horizontal", "parallel", "perpendicular", "follow"] },
    waypoints: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, required: ["x", "y"], properties: { x: { type: "number" }, y: { type: "number" } } } },
    trunkAxis: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;
const mapStyleProperties = {
  layoutType: { type: "string", maxLength: 64 }, layout: { type: "string", maxLength: 64 },
  layoutStyle: { type: "string", maxLength: 64 }, layoutName: { type: "string", maxLength: 64 },
  structure: { type: "string", maxLength: 64 }, mapType: { type: "string", maxLength: 64 }, family: { type: "string", maxLength: 64 },
  direction: { type: "string", enum: ["right", "left", "down", "up"] }, layoutDirection: { type: "string", enum: ["right", "left", "down", "up"] },
  growthMode: { type: "string", enum: ["one-side", "both-side"] },
  connectionStyle: { type: "string", enum: ["curved", "orthogonal", "straight", "straight_arrow", "elbow"] },
  connectorLineType: { type: "string", enum: ["curved", "orthogonal", "straight", "elbow"] },
  connectorPaletteId: { type: "string", maxLength: 128 }, stylePresetId: { type: "string", maxLength: 128 }, paletteId: { type: "string", maxLength: 128 }, palette: { type: "string", maxLength: 128 },
  layoutAngle: { type: "number", minimum: -360, maximum: 360 },
  timelineBranchMode: { type: "string", enum: ["auto", "one-side", "one-side-reverse", "alternate"] },
  timelineDescendantStyle: { type: "string", enum: ["tree", "hierarchy"] }, catalogDescendantStyle: { type: "string", enum: ["tree", "hierarchy"] },
} as const;

export const WORKSPACE_RUNTIME_DIAGRAM_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  extend_flowchart: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: {
      type: { type: "string", const: "extend_flowchart" }, blockId: id,
      nodes: { type: "array", maxItems: 80, items: diagramNode },
      edges: { type: "array", maxItems: 160, items: diagramEdge },
      direction: { type: "string", enum: ["down", "right"] },
    },
  },
  disconnect_nodes: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: { type: { type: "string", const: "disconnect_nodes" }, ...disconnectSelector },
  },
  repair_connector: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: {
      type: { type: "string", const: "repair_connector" }, ...repairSelector,
      label: { type: "string", maxLength: 300 }, lineLabel: { type: "string", maxLength: 300 },
    },
  },
  repair_flowchart: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: {
      type: { type: "string", const: "repair_flowchart" }, ...repairSelector,
      label: { type: "string", maxLength: 300 }, lineLabel: { type: "string", maxLength: 300 },
    },
  },
  update_relationship: {
    type: "object", additionalProperties: false, required: ["type"],
    properties: {
      type: { type: "string", const: "update_relationship" }, connectorId: id,
      from: endpoint, fromBlockId: id, to: endpoint, toBlockId: id,
      between: { type: "object", additionalProperties: false, properties: { fromBlockId: id, toBlockId: id } },
      relationshipPatch,
      ...relationshipPatch.properties,
    },
  },
  update_map_style: {
    type: "object", additionalProperties: false, required: ["type", "blockId"],
    properties: { type: { type: "string", const: "update_map_style" }, blockId: id, ...mapStyleProperties,
      mapLayout: { type: "object", additionalProperties: false, properties: { family: { type: "string", maxLength: 64 }, direction: mapStyleProperties.direction, growthMode: mapStyleProperties.growthMode } },
      style: { type: "object", additionalProperties: false, properties: mapStyleProperties } },
  },
};
