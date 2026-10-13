import { flowchartLayoutFor } from "./mapLayout";
import type { AgentBoardState } from "./operationsCore";
import { blockRect, diagramArrayParam, id, mapRoot, now, param, record, resolveId, stringValue, topic } from "./operationsCore";
import { arrangeSemanticFlowchartMap } from "./operationsDiagramLayout";
import { diagramLabel, diagramNodes, diagramRole, diagramStyle } from "./operationsDiagramCreate";
import type { JsonMap } from "./operationsTables";
function semanticBlockKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function resolveSemanticEndpoint(
  value: unknown,
  byKey: Map<string, string>,
): string | undefined {
  const key = String(value ?? "").trim();
  if (!key) return undefined;
  return byKey.get(key) ?? byKey.get(semanticBlockKey(key));
}

/**
 * Extends one existing free-form flowchart as a graph transaction. Generic
 * add_child/connect_nodes actions are intentionally not used here: they carry
 * tree semantics and make a model guess which existing label/ID belongs to
 * the same diagram. The high-level action resolves old nodes, creates only
 * genuinely new nodes, adds only missing edges, then lays out the complete
 * graph again.
 */
export function extendFlowchart(state: AgentBoardState, raw: JsonMap): string[] {
  const targetId = resolveId(raw, state);
  if (!targetId) return [];
  const rootId = mapRoot(state, targetId);
  const root = state.blocks[rootId];
  if (!root || record(root.mapLayout).family !== "flowchart") return [];

  const mapId = stringValue(root.mapId) ?? rootId;
  const existing = Object.values(state.blocks).filter((block) =>
    String(block.id) === rootId || String(block.mapId ?? "") === mapId,
  );
  const byKey = new Map<string, string>();
  existing.forEach((block) => {
    byKey.set(String(block.id), String(block.id));
    const label = topic(block);
    if (label) byKey.set(semanticBlockKey(label), String(block.id));
    const persistedKey = stringValue(record(block.data).semanticKey);
    if (persistedKey) {
      byKey.set(persistedKey, String(block.id));
      byKey.set(semanticBlockKey(persistedKey), String(block.id));
    }
  });

  const createdIds: string[] = [];
  const sourceNodes = diagramNodes(raw);
  sourceNodes.forEach((node) => {
    const label = diagramLabel(node);
    const requestedKey = stringValue(node.id) ?? label;
    const existingId = resolveSemanticEndpoint(requestedKey, byKey)
      ?? resolveSemanticEndpoint(label, byKey);
    if (existingId) {
      byKey.set(requestedKey, existingId);
      byKey.set(semanticBlockKey(requestedKey), existingId);
      return;
    }

    const blockId = id();
    const role = diagramRole(node);
    const created = now();
    state.blocks[blockId] = {
      id: blockId,
      mapId,
      type: "text",
      transform: { computed: null, override: { x: blockRect(root).x, y: blockRect(root).y, w: role === "decision" ? 220 : 220, h: role === "decision" ? 108 : role === "terminator" ? 72 : 82, rotation: 0, zIndex: created } },
      data: { markdown: label, semanticKey: requestedKey },
      style: { ...diagramStyle(role), ...(record(node.style) as JsonMap) },
      ...(stringValue(node.description) ? { description: node.description } : {}),
      createdAt: created,
      updatedAt: created,
    };
    state.blockOrder.push(blockId);
    createdIds.push(blockId);
    byKey.set(requestedKey, blockId);
    byKey.set(semanticBlockKey(requestedKey), blockId);
    byKey.set(semanticBlockKey(label), blockId);
  });

  const createdConnectorIds: string[] = [];
  const edgeSource = diagramArrayParam(raw, "edges").map(record);
  edgeSource.forEach((edge) => {
    const fromValue = stringValue(edge.from) ?? stringValue(edge.source);
    const toValue = stringValue(edge.to) ?? stringValue(edge.target);
    const from = resolveSemanticEndpoint(fromValue, byKey);
    const to = resolveSemanticEndpoint(toValue, byKey);
    if (!from || !to || from === to) return;
    const label = stringValue(edge.label) ?? stringValue(edge.lineLabel);
    const existingMatch = Object.values(state.connectors).find((link) =>
      String(link.fromBlockId) === from
      && String(link.toBlockId) === to
      && (stringValue(link.label) ?? "") === (label ?? ""),
    );
    if (existingMatch) {
      createdConnectorIds.push(String(existingMatch.id));
      return;
    }
    const connectorId = id();
    state.connectors[connectorId] = {
      id: connectorId,
      fromBlockId: from,
      toBlockId: to,
      lineType: "orthogonal",
      arrowEnd: true,
      strokeColor: "#1e293b",
      ...(label ? { label, labelColor: label.toLowerCase() === "yes" || label.toLowerCase() === "có" ? "#16a34a" : label.toLowerCase() === "no" || label.toLowerCase() === "không" ? "#dc2626" : "#1e293b" } : {}),
    };
    createdConnectorIds.push(connectorId);
  });

  const direction = stringValue(param(raw, "direction")) === "down"
    ? "down"
    : stringValue(param(raw, "direction")) === "right"
      ? "right"
      : (stringValue(record(root.mapLayout).direction) === "right" ? "right" : "down");
  const mapLayout = flowchartLayoutFor(raw);
  root.mapLayout = { ...record(root.mapLayout), ...mapLayout, direction };
  Object.values(state.connectors).forEach((link) => {
    if (String(link.fromBlockId) === rootId || String(link.toBlockId) === rootId ||
      existing.some((block) => String(block.id) === String(link.fromBlockId) || String(block.id) === String(link.toBlockId)) ||
      createdIds.includes(String(link.fromBlockId)) || createdIds.includes(String(link.toBlockId))) {
      link.lineType = mapLayout.connectorLineType;
    }
  });
  const arranged = arrangeSemanticFlowchartMap(state, rootId, direction);
  // Report every requested edge's connector id (new or already-present), not
  // just new block ids, so the receipt reflects what the graph actually
  // contains instead of only what this call happened to create.
  return arranged ? [rootId, ...createdIds, ...createdConnectorIds] : [];
}