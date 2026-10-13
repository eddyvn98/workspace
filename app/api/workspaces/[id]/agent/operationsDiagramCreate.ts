import { layoutSemanticDiagram, routePositionedSemanticEdges } from "@/app/workspace/layout/semanticDiagramLayout";
import type { AgentBoardState } from "./operationsCore";
import { blockRect, diagramArrayParam, id, now, param, record, stringValue, type CanvasRect } from "./operationsCore";
import { flowchartLayoutFor, swimlaneLayoutFor } from "./mapLayout";
import type { JsonMap } from "./operationsTables";
type DiagramDirection = "down" | "right";
type SwimlaneOrientation = "horizontal" | "vertical";

export function diagramNodes(raw: JsonMap): JsonMap[] {
	return diagramArrayParam(raw, "nodes").map(record).filter((node) => Object.keys(node).length > 0);
}

export function diagramLabel(node: JsonMap): string {
  return stringValue(node.label) ?? stringValue(node.topic) ?? stringValue(node.text) ?? stringValue(node.name) ?? "Node";
}

export function diagramRole(node: JsonMap): string {
  const role = (stringValue(node.role) ?? "process").toLowerCase().replace(/[\s_-]+/g, "-");
  if (["start", "end", "terminator"].includes(role)) return "terminator";
  if (["decision", "condition", "branch"].includes(role)) return "decision";
  if (["input-output", "input/output", "io", "data"].includes(role)) return "data";
  if (["storage", "database", "db"].includes(role)) return "storage";
  if (["preparation", "prepare"].includes(role)) return "preparation";
  return "process";
}

export function diagramStyle(role: string): JsonMap {
  const shapeKind = role === "terminator" ? "pill" : role === "decision" ? "diamond" : role === "data" ? "parallelogram" : role === "storage" ? "cylinder" : role === "preparation" ? "hexagon" : "rounded_rect";
  const backgroundColor = role === "terminator" ? "#ede9fe" : role === "decision" ? "#fef3c7" : "#eef2f7";
  return { shapeKind, backgroundColor, borderColor: "#1e293b", borderWidth: 1.5, textColor: "#0f172a" };
}

function mapOrigin(state: AgentBoardState): { x: number; y: number } {
  const maxX = Object.values(state.blocks).reduce((max, block) => Math.max(max, blockRect(block).x + blockRect(block).w), 0);
  return { x: maxX > 0 ? maxX + 240 : 80, y: 80 };
}

function diagramEdgeSide(from: CanvasRect, to: CanvasRect, direction: DiagramDirection, source: boolean): string {
  if (direction === "right") return source ? "right" : "left";
  return source ? "bottom" : "top";
}

/**
 * High-level diagram contract for the agent. The model supplies only
 * semantic nodes/edges; this function owns IDs, role->shape mapping, graph
 * ranking, spacing, anchors, and the map marker. That prevents Dify from
 * having to guess pixel coordinates or accidentally creating a mindmap tree.
 */
export function createFlowchart(state: AgentBoardState, raw: JsonMap): string[] {
  const sourceNodes = diagramNodes(raw);
  if (sourceNodes.length === 0) return [];
  const direction = stringValue(param(raw, "direction")) === "right" ? "right" : "down";
  const sourceEdges: JsonMap[] = diagramArrayParam(raw, "edges").map(record);
  const keys = sourceNodes.map((node, index) => stringValue(node.id) ?? `node-${index + 1}`);
  const keySet = new Set(keys);
  const explicitEdges = sourceEdges.filter((edge) => {
    const from = stringValue(edge.from) ?? stringValue(edge.source);
    const to = stringValue(edge.to) ?? stringValue(edge.target);
    return Boolean(from && to && keySet.has(from) && keySet.has(to) && from !== to);
  });
  // Some older Dify custom-tool schemas silently drop the optional edges
  // field even though the model described the connections in its response.
  // Preserve a usable linear flow in that case; explicit edges always win and
  // branching diagrams still use the model-supplied graph.
  const edges = explicitEdges.length > 0
    ? explicitEdges
    : keys.slice(1).map((to, index) => ({ from: keys[index], to }));
  const origin = mapOrigin(state);
  const sizes = new Map(keys.map((key, index) => {
    const role = diagramRole(sourceNodes[index]);
    return [key, role === "decision" ? { w: 220, h: 108 } : role === "terminator" ? { w: 190, h: 72 } : { w: 220, h: 82 }] as const;
  }));
  const layout = layoutSemanticDiagram(
    keys.map((key, index) => ({ key, label: diagramLabel(sourceNodes[index]), ...sizes.get(key)! })),
    edges.map((edge) => {
      const value = record(edge);
      return { from: String(value.from ?? value.source), to: String(value.to ?? value.target), label: stringValue(value.label) ?? stringValue(value.lineLabel) };
    }),
    origin,
    direction,
  );
  const idByKey = new Map<string, string>();
  const created = now();
  const createdIds: string[] = [];
  keys.forEach((key) => {
    const node = sourceNodes[keys.indexOf(key)];
    const role = diagramRole(node);
    const rect = layout.positions.get(key)!;
    const blockId = id();
    idByKey.set(key, blockId);
    state.blocks[blockId] = {
      id: blockId,
      mapId: "",
      type: "text",
      transform: { computed: rect, override: null },
      data: { markdown: diagramLabel(node), semanticKey: keys[keys.indexOf(key)] },
      style: { ...diagramStyle(role), ...(record(node.style) as JsonMap) },
      ...(stringValue(node.description) ? { description: node.description } : {}),
      createdAt: created,
      updatedAt: created,
    };
    state.blockOrder.push(blockId);
    createdIds.push(blockId);
  });
  const mapId = createdIds[0];
  createdIds.forEach((blockId) => { state.blocks[blockId].mapId = mapId; });
  const mapLayout = flowchartLayoutFor(raw);
  mapLayout.direction = direction;
  state.blocks[mapId].mapLayout = mapLayout;
  const createdConnectorIds: string[] = [];
  edges.forEach((edge, index) => {
    const fromKey = stringValue(edge.from) ?? stringValue(edge.source)!;
    const toKey = stringValue(edge.to) ?? stringValue(edge.target)!;
    const fromId = idByKey.get(fromKey)!;
    const toId = idByKey.get(toKey)!;
    const fromRect = layout.positions.get(fromKey)!;
    const toRect = layout.positions.get(toKey)!;
    const label = stringValue(edge.label) ?? stringValue(edge.lineLabel);
    const connectorId = id();
    state.connectors[connectorId] = {
      id: connectorId, fromBlockId: fromId, toBlockId: toId,
      fromSide: layout.routes.get(index)?.fromSide ?? diagramEdgeSide(fromRect, toRect, direction, true),
      toSide: layout.routes.get(index)?.toSide ?? diagramEdgeSide(fromRect, toRect, direction, false),
      lineType: mapLayout.connectorLineType, arrowEnd: true, strokeColor: "#1e293b",
      ...(layout.routes.get(index)?.waypoints.length ? { waypoints: layout.routes.get(index)!.waypoints } : {}),
      ...(label ? { label, labelColor: label.toLowerCase() === "yes" ? "#16a34a" : label.toLowerCase() === "no" ? "#dc2626" : "#1e293b" } : {}),
    };
    createdConnectorIds.push(connectorId);
    void index;
  });
  // The requested edge list can silently lose entries above (an edge whose
  // from/to key isn't in this call's node set never enters `edges`), and the
  // caller only sees this action's block ids, never which connectors it
  // actually created. Returning the connector ids too lets the board's
  // change receipt report the true persisted connector count instead of
  // letting a narrated "N connectors created" go unverified against what was
  // actually written.
  return [...createdIds, ...createdConnectorIds];
}

export function createSwimlane(state: AgentBoardState, raw: JsonMap): string[] {
  const laneSource = diagramArrayParam(raw, "lanes");
  const lanes = laneSource.map((lane, index) => {
    const value = typeof lane === "string" ? {} : record(lane);
    return { id: stringValue(value.id) ?? `lane-${index + 1}`, label: typeof lane === "string" ? lane : diagramLabel(value) };
  }).filter((lane) => lane.label);
  const sourceNodes = diagramNodes(raw);
  if (lanes.length === 0 || sourceNodes.length === 0) return [];
  const orientation: SwimlaneOrientation = stringValue(param(raw, "orientation")) === "vertical" ? "vertical" : "horizontal";
  const mapLayout = swimlaneLayoutFor(raw);
  const origin = mapOrigin(state);
  const mapId = id();
  const laneIndex = new Map(lanes.map((lane, index) => [lane.id, index]));
  const byLane = new Map<string, JsonMap[]>();
  sourceNodes.forEach((node) => {
    const laneId = stringValue(node.laneId) ?? lanes[0].id;
    const lane = laneIndex.has(laneId) ? laneId : lanes[0].id;
    byLane.set(lane, [...(byLane.get(lane) ?? []), node]);
  });
  const stepW = 190;
  const stepH = 72;
  const gap = 56;
  const padding = 28;
  const maxSteps = Math.max(...lanes.map((lane) => byLane.get(lane.id)?.length ?? 0), 1);
  const laneThickness = orientation === "horizontal" ? stepH + padding * 2 : stepW + padding * 2;
  const bodyLength = orientation === "horizontal" ? maxSteps * stepW + Math.max(0, maxSteps - 1) * gap + padding * 2 : maxSteps * stepH + Math.max(0, maxSteps - 1) * gap + padding * 2;
  const tableW = orientation === "horizontal" ? 130 + bodyLength : lanes.length * laneThickness;
  const tableH = orientation === "horizontal" ? lanes.length * laneThickness : 130 + bodyLength;
  const tableId = id();
  state.blocks[tableId] = {
    id: tableId, mapId, type: "table",
    transform: { computed: { x: origin.x, y: origin.y, w: tableW, h: tableH, rotation: 0, zIndex: 0 }, override: null },
    data: orientation === "horizontal"
      ? { rows: lanes.length, cols: 2, cells: lanes.map((lane) => [lane.label, ""]), headerCol: true, rowWeights: lanes.map(() => laneThickness), colWeights: [130, bodyLength], passThroughEmptyCellClicks: true, disableCellAttachment: true }
      : { rows: 2, cols: lanes.length, cells: [lanes.map((lane) => lane.label), lanes.map(() => "")], headerRow: true, rowWeights: [130, bodyLength], colWeights: lanes.map(() => laneThickness), passThroughEmptyCellClicks: true, disableCellAttachment: true },
    style: { borderColor: "#94a3b8", backgroundColor: "transparent" },
    mapLayout,
    createdAt: now(), updatedAt: now(),
  };
  state.blockOrder.push(tableId);
  const idByKey = new Map<string, string>();
  const rectByKey = new Map<string, CanvasRect>();
  const createdIds = [tableId];
  lanes.forEach((lane, lanePos) => {
    (byLane.get(lane.id) ?? []).forEach((node, stepPos) => {
      const key = stringValue(node.id) ?? `${lane.id}-${stepPos}`;
      const blockId = id();
      const rect = orientation === "horizontal"
        ? { x: origin.x + 130 + padding + stepPos * (stepW + gap), y: origin.y + lanePos * laneThickness + (laneThickness - stepH) / 2, w: stepW, h: stepH }
        : { x: origin.x + lanePos * laneThickness + (laneThickness - stepW) / 2, y: origin.y + 130 + padding + stepPos * (stepH + gap), w: stepW, h: stepH };
      idByKey.set(key, blockId); rectByKey.set(key, rect);
      state.blocks[blockId] = { id: blockId, mapId, type: "shape", transform: { computed: { ...rect, rotation: 0, zIndex: stepPos + 1 }, override: null }, data: { shapeKind: diagramRole(node) === "decision" ? "diamond" : "rounded_rect", label: diagramLabel(node) }, style: { ...diagramStyle(diagramRole(node)), backgroundColor: "#ffffff" }, createdAt: now(), updatedAt: now() };
      state.blockOrder.push(blockId); createdIds.push(blockId);
    });
  });
  const edgeSource: JsonMap[] = diagramArrayParam(raw, "edges").map(record);
  const explicitEdges = edgeSource.map((edge) => ({
    edge,
    from: stringValue(edge.from) ?? stringValue(edge.source),
    to: stringValue(edge.to) ?? stringValue(edge.target),
  })).filter((value): value is { edge: JsonMap; from: string; to: string } => Boolean(
    value.from && value.to && value.from !== value.to && rectByKey.has(value.from) && rectByKey.has(value.to),
  ));
  const keys = [...idByKey.keys()];
  const semanticEdges: Array<{ from: string; to: string; label?: string }> = explicitEdges.length > 0
    ? explicitEdges.map(({ edge, from, to }) => ({ from, to, label: stringValue(edge.label) ?? stringValue(edge.lineLabel) }))
    : keys.slice(1).map((to, index) => ({ from: keys[index], to }));
  const routes = routePositionedSemanticEdges(
    semanticEdges,
    rectByKey,
    orientation === "horizontal" ? "right" : "down",
  );
  const createdConnectorIds: string[] = [];
  semanticEdges.forEach((semanticEdge, edgeIndex) => {
    const fromKey = semanticEdge.from;
    const toKey = semanticEdge.to;
    const fromId = fromKey ? idByKey.get(fromKey) : undefined;
    const toId = toKey ? idByKey.get(toKey) : undefined;
    if (!fromId || !toId || !rectByKey.has(fromKey!) || !rectByKey.has(toKey!)) return;
    const routed = routes.get(edgeIndex);
    const connectorId = id();
    state.connectors[connectorId] = {
      id: connectorId,
      fromBlockId: fromId,
      toBlockId: toId,
      fromSide: routed?.fromSide ?? (orientation === "horizontal" ? "right" : "bottom"),
      toSide: routed?.toSide ?? (orientation === "horizontal" ? "left" : "top"),
      lineType: mapLayout.connectorLineType,
      arrowEnd: true,
      strokeColor: "#1e293b",
      ...(routed?.waypoints.length ? { waypoints: routed.waypoints } : {}),
      ...(semanticEdge.label ? { label: semanticEdge.label } : {}),
    };
    createdConnectorIds.push(connectorId);
  });
  // See createFlowchart's matching comment: report every connector this call
  // actually persisted, not just the block ids, so the receipt can't silently
  // diverge from a narrated connector count.
  return [...createdIds, ...createdConnectorIds];
}
