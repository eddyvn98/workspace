type Action = Record<string, unknown>;

function isRecord(value: unknown): value is Action {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateDiagramAction(action: Action): string | null {
  const type = action.type;
  if (type === "update_relationship") {
    const between = isRecord(action.between) ? action.between : {};
    const hasConnector = typeof action.connectorId === "string" && Boolean(action.connectorId.trim());
    const hasFrom = action.from ?? action.fromBlockId ?? between.fromBlockId;
    const hasTo = action.to ?? action.toBlockId ?? between.toBlockId;
    const patch = isRecord(action.relationshipPatch) ? action.relationshipPatch : {};
    const patchFields = ["lineType", "lineDash", "lineStyle", "dashed", "lineColor", "strokeColor", "color", "lineWidth", "strokeWidth", "arrowStart", "arrowEnd", "lineLabel", "label", "labelColor", "labelFontSize", "labelBold", "labelItalic", "labelUnderline", "labelStrikethrough", "labelBgColor", "labelAlign", "labelPosition", "labelOrientation", "waypoints", "trunkAxis"];
    if (!hasConnector && !(hasFrom && hasTo)) return "update_relationship requires connectorId or both connector endpoints.";
    if (![...patchFields].some((field) => action[field] !== undefined || patch[field] !== undefined)) return "update_relationship requires at least one relationship property.";
  }
  if (type === "extend_flowchart") {
    const nodes = Array.isArray(action.nodes) ? action.nodes : [];
    const edges = Array.isArray(action.edges) ? action.edges : [];
    if (nodes.length === 0 && edges.length === 0) return "extend_flowchart requires nodes or edges.";
    if (nodes.some((node) => !isRecord(node) || ![node.label, node.topic, node.text, node.name].some((value) => typeof value === "string" && value.trim()))) {
      return "extend_flowchart nodes require a label, topic, text or name.";
    }
    if (edges.some((edge) => !isRecord(edge) || !(edge.from ?? edge.source) || !(edge.to ?? edge.target))) {
      return "extend_flowchart edges require from/source and to/target endpoints.";
    }
  }
  if (type === "disconnect_nodes" || type === "repair_connector" || type === "repair_flowchart") {
    const hasConnector = typeof action.connectorId === "string" && action.connectorId.trim();
    const hasFrom = type === "disconnect_nodes" ? action.from ?? action.fromBlockId : action.from ?? action.source;
    const hasTo = type === "disconnect_nodes" ? action.to ?? action.toBlockId : action.to ?? action.destination;
    if (!hasConnector && !(hasFrom && hasTo)) return `${type} requires connectorId or both connector endpoints.`;
  }
  return null;
}
