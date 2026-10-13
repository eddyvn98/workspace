type VisualSchema = {
  type: string;
  const?: unknown;
  enum?: readonly unknown[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  required?: readonly string[];
  additionalProperties?: boolean;
  properties?: Record<string, VisualSchema>;
  items?: VisualSchema;
};

const SEMANTIC_LABEL: VisualSchema = { type: "string", minLength: 1, maxLength: 500 };

function nodeDraftSchema(depth = 0): VisualSchema {
  const properties: Record<string, VisualSchema> = {
    topic: SEMANTIC_LABEL,
    description: { type: "string", maxLength: 4000 },
    icon: { type: "string", maxLength: 128 },
    image: { type: "string", maxLength: 2000 },
    id: { type: "string", maxLength: 128 },
    label: SEMANTIC_LABEL,
    role: { type: "string", enum: ["terminator", "process", "decision", "data", "storage", "preparation"] },
    laneId: { type: "string", maxLength: 128 },
  };
  if (depth < 6) properties.children = { type: "array", maxItems: 80, items: nodeDraftSchema(depth + 1) };
  return { type: "object", additionalProperties: false, required: ["topic"], properties };
}

const diagramNode: VisualSchema = { type: "object", additionalProperties: false, required: ["id", "label"], properties: {
  id: { type: "string", minLength: 1, maxLength: 128 }, label: SEMANTIC_LABEL,
  role: { type: "string", enum: ["terminator", "process", "decision", "data", "storage", "preparation"] },
  laneId: { type: "string", maxLength: 128 },
} };
const diagramEdge: VisualSchema = { type: "object", additionalProperties: false, required: ["from", "to"], properties: {
  from: { type: "string", minLength: 1, maxLength: 128 }, to: { type: "string", minLength: 1, maxLength: 128 },
  label: { type: "string", maxLength: 300 }, lineLabel: { type: "string", maxLength: 300 },
} };
const diagramProperties: Record<string, VisualSchema> = {
  nodes: { type: "array", minItems: 1, maxItems: 80, items: diagramNode },
  edges: { type: "array", minItems: 1, maxItems: 160, items: diagramEdge },
  direction: { type: "string", enum: ["down", "right"] },
};

export const WORKSPACE_RUNTIME_VISUAL_ACTION_SCHEMAS = {
  create_map: { type: "object", additionalProperties: false, required: ["type", "nodes"], properties: { type: { type: "string", const: "create_map" }, nodes: { type: "array", minItems: 1, maxItems: 80, items: nodeDraftSchema() }, layoutType: { type: "string", enum: ["hierarchy", "treeview", "timeline", "fishbone", "logical-right", "logical-left", "mindmap", "mindmap-vertical", "org-chart", "catalog", "outline", "vertical-timeline"] }, layoutDirection: { type: "string", enum: ["right", "left", "down", "up"] }, growthMode: { type: "string", enum: ["one-side", "both-side"] }, connectionStyle: { type: "string", enum: ["curved", "orthogonal", "straight"] } } },
  connect_nodes: { type: "object", additionalProperties: false, required: ["type", "from", "to"], properties: { type: { type: "string", const: "connect_nodes" }, from: SEMANTIC_LABEL, to: SEMANTIC_LABEL, label: { type: "string", maxLength: 300 }, lineLabel: { type: "string", maxLength: 300 }, connectionStyle: { type: "string", enum: ["curved", "orthogonal", "straight", "straight_arrow"] }, lineColor: { type: "string", maxLength: 64 }, lineWidth: { type: "number", minimum: 1, maximum: 16 }, lineDash: { type: "string", enum: ["solid", "dashed", "dotted"] }, arrowStart: { type: "boolean" }, arrowEnd: { type: "boolean" } } },
  create_flowchart: { type: "object", additionalProperties: false, required: ["type", "nodes", "edges"], properties: { type: { type: "string", const: "create_flowchart" }, ...diagramProperties } },
  create_swimlane: { type: "object", additionalProperties: false, required: ["type", "nodes", "edges", "lanes"], properties: { type: { type: "string", const: "create_swimlane" }, ...diagramProperties, lanes: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1, maxLength: 128 }, label: SEMANTIC_LABEL } } }, orientation: { type: "string", enum: ["horizontal", "vertical"] } } },
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateWorkspaceRuntimeVisualAction(action: Record<string, unknown>): string | null {
  if (action.type === "create_flowchart" || action.type === "create_swimlane") {
    const nodes = action.nodes as Array<Record<string, unknown>>;
    const edges = action.edges as Array<Record<string, unknown>>;
    const nodeIds = new Set(nodes.map((node) => String(node.id)));
    if (nodeIds.size !== nodes.length) return `${action.type}.nodes must have unique IDs.`;
    if (edges.some((edge) => !nodeIds.has(String(edge.from)) || !nodeIds.has(String(edge.to)) || edge.from === edge.to)) return `${action.type}.edges must connect two different declared nodes.`;
    if (action.type === "create_swimlane") {
      const lanes = action.lanes as Array<Record<string, unknown>>;
      const laneIds = new Set(lanes.map((lane) => String(lane.id)));
      if (laneIds.size !== lanes.length) return "create_swimlane.lanes must have unique IDs.";
      if (nodes.some((node) => node.laneId !== undefined && !laneIds.has(String(node.laneId)))) return "create_swimlane node laneId must reference a declared lane.";
    }
  }
  if (action.type === "create_map" && Array.isArray(action.nodes)) {
    const semanticIds = new Set<string>();
    const hasDuplicateIds = (nodes: unknown[]): boolean => nodes.some((node) => {
      if (!record(node)) return false;
      const id = typeof node.id === "string" ? node.id.trim().toLowerCase() : "";
      if (id && semanticIds.has(id)) return true;
      if (id) semanticIds.add(id);
      return Array.isArray(node.children) && hasDuplicateIds(node.children);
    });
    if (hasDuplicateIds(action.nodes)) return "create_map node ids must be unique.";
    const hasInvalidDraft = (nodes: unknown[], depth = 0): boolean => nodes.some((node) => {
      if (depth > 6 || !record(node) || typeof node.topic !== "string" || !node.topic.trim()) return true;
      return Array.isArray(node.children) && hasInvalidDraft(node.children, depth + 1);
    });
    if (hasInvalidDraft(action.nodes)) return "create_map.nodes must use topic for every visible label and be at most 7 levels deep.";
  }
  return null;
}
