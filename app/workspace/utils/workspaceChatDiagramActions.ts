"use client";

import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { createBlockId, createComputedTransform, resolveTransform, type CanvasBlock, type MapLayoutSettings } from "../types/block";
import { createConnectorId, type CanvasConnector } from "../types/connector";
import { DEFAULT_MAP_LAYOUT, blockIdsInMap, findMapRootId } from "../layout/mapRoot";
import { routePositionedSemanticEdges, layoutSemanticDiagram } from "../layout/semanticDiagramLayout";
import { getBlockTopic, resolveWorkspaceTargetIds } from "./workspaceChatResolver";

type JsonMap = Record<string, unknown>;
type DiagramDirection = "down" | "right";
type SwimlaneOrientation = "horizontal" | "vertical";

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value as JsonMap);
  if (typeof value === "string") {
    try { return arrayValue(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

function arrayParam(action: JsonMap, key: string): unknown[] {
  return arrayValue(action[key] ?? record(action.params)[key]);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function labelOf(node: JsonMap): string {
  return stringValue(node.label) ?? stringValue(node.topic) ?? stringValue(node.text) ?? stringValue(node.name) ?? "Node";
}

function roleOf(node: JsonMap): string {
  const role = (stringValue(node.role) ?? "process").toLowerCase().replace(/[\s_-]+/g, "-");
  if (["start", "end", "terminator"].includes(role)) return "terminator";
  if (["decision", "condition", "branch"].includes(role)) return "decision";
  if (["input-output", "input/output", "io", "data"].includes(role)) return "data";
  if (["storage", "database", "db"].includes(role)) return "storage";
  if (["preparation", "prepare"].includes(role)) return "preparation";
  return "process";
}

function styleFor(role: string): CanvasBlock["style"] {
  const shapeKind = role === "terminator" ? "pill" : role === "decision" ? "diamond" : role === "data" ? "parallelogram" : role === "storage" ? "cylinder" : role === "preparation" ? "hexagon" : "rounded_rect";
  const backgroundColor = role === "terminator" ? "#ede9fe" : role === "decision" ? "#fef3c7" : "#eef2f7";
  return { shapeKind, backgroundColor, borderColor: "#1e293b", borderWidth: 1.5, textColor: "#0f172a" };
}

function originOf(): { x: number; y: number } {
  const blocks = Object.values(useWorkspaceStore.getState().blocks);
  let maxX = 0;
  let minY = 80;
  blocks.forEach((block) => {
    const rect = resolveTransform(block.transform, { x: 0, y: 0, w: 170, h: 36, rotation: 0, zIndex: 0 });
    maxX = Math.max(maxX, rect.x + rect.w);
    minY = Math.min(minY, rect.y);
  });
  return { x: maxX > 0 ? maxX + 240 : 80, y: minY };
}

function mapLayout(family: MapLayoutSettings["family"], direction: MapLayoutSettings["direction"]): MapLayoutSettings {
  return { ...DEFAULT_MAP_LAYOUT, family, direction, connectorLineType: "orthogonal" };
}

function edgeEndpoint(edge: JsonMap, key: "from" | "to"): string | undefined {
  return stringValue(edge[key]) ?? stringValue(edge[key === "from" ? "source" : "target"]);
}

function commitDiagram(
  blocks: Record<string, CanvasBlock>,
  blockOrder: string[],
  connectors: Record<string, CanvasConnector>,
  selectedBlockIds: string[],
): void {
  // One store transaction is important here: the persistence subscriber must
  // see the newly-created blocks and their connectors in the same snapshot.
  // Calling addBlock/addConnector repeatedly let a fast autosave capture the
  // blocks first and lose the connector additions from the durable revision.
  useWorkspaceStore.setState({ blocks, blockOrder, connectors, selectedBlockIds });
}

function resolveDiagramEndpoint(value: unknown): string | undefined {
  const ids = resolveWorkspaceTargetIds({ target: value });
  return ids.length === 1 ? ids[0] : undefined;
}

function repairValue(action: JsonMap, key: string): unknown {
  const params = record(action.params);
  const target = record(action.target);
  const repair = record(action.repair);
  return action[key] ?? params[key] ?? target[key] ?? repair[key];
}

/**
 * Repairs one existing selectable workspace connector without asking the
 * model for pixel coordinates. The model supplies semantic endpoints and a
 * strategy; the engine reroutes the connector in any diagram that exposes
 * editable wires. Only free-form flowcharts may be re-laid out: swimlane
 * cells own their positions, so reposition_and_reroute there means reroute
 * while preserving the lane geometry.
 */
function repairFlowchartAction(action: JsonMap): string[] {
  const state = useWorkspaceStore.getState();
  const connectorId = stringValue(repairValue(action, "connectorId"));
  const fromId = resolveDiagramEndpoint(repairValue(action, "from") ?? repairValue(action, "source"));
  const toId = resolveDiagramEndpoint(repairValue(action, "to") ?? repairValue(action, "destination"));
  const label = stringValue(repairValue(action, "label") ?? repairValue(action, "lineLabel"));
  const endpointMatches = Object.values(state.connectors).filter((connector) =>
    Boolean(fromId && toId && connector.fromBlockId === fromId && connector.toBlockId === toId),
  );
  const labelledMatches = label
    ? endpointMatches.filter((connector) => connector.label?.toLowerCase() === label.toLowerCase())
    : endpointMatches;
  const targetConnector = connectorId
    ? Object.values(state.connectors).find((connector) => connector.id === connectorId)
    : labelledMatches[0] ?? (endpointMatches.length === 1 ? endpointMatches[0] : undefined);
  if (!targetConnector) return [];

  const rootId = findMapRootId(state.blocks, targetConnector.fromBlockId);
  const family = rootId ? state.blocks[rootId]?.mapLayout?.family : undefined;
  const structural = state.blocks[targetConnector.toBlockId]?.parentId === targetConnector.fromBlockId;
  if (structural && family !== "flowchart" && family !== "swimlane") return [];
  const mapIds = rootId ? blockIdsInMap(state.blocks, rootId) : new Set([targetConnector.fromBlockId, targetConnector.toBlockId]);
  const nodeIds = new Set([...mapIds].filter((id) => state.blocks[id]?.type !== "table"));
  // A standalone connector has no map root, but the surrounding canvas blocks
  // are still useful obstacles for a clean AI reroute.
  if (!rootId) Object.values(state.blocks).forEach((block) => { if (block.type !== "table") nodeIds.add(block.id); });
  const nodeBlocks = [...nodeIds]
    .map((id) => state.blocks[id])
    .filter((block): block is CanvasBlock => Boolean(block));
  if (nodeBlocks.length < 2) return [];

  const positions = new Map(nodeBlocks.map((block) => {
    const rect = resolveTransform(block.transform, { x: 0, y: 0, w: 220, h: 82, rotation: 0, zIndex: 0 });
    return [block.id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h }] as const;
  }));
  const edges = Object.values(state.connectors)
    .filter((connector) => nodeIds.has(connector.fromBlockId) && nodeIds.has(connector.toBlockId))
    .filter((connector) => Boolean(rootId) || connector.id === targetConnector.id)
    .map((connector) => ({ from: connector.fromBlockId, to: connector.toBlockId, label: connector.label }));
  const requestedDirection = stringValue(repairValue(action, "direction"))
    ?? (rootId && state.blocks[rootId]?.mapLayout?.direction === "right" ? "right" : "down");
  const direction: "right" | "down" = requestedDirection === "right" ? "right" : "down";
  const strategy = (stringValue(repairValue(action, "strategy")) ?? "reroute_only").toLowerCase().replace(/[\s-]+/g, "_");
  const reposition = family === "flowchart" && (strategy === "reposition_and_reroute" || strategy === "reposition" || strategy === "reflow" || strategy === "reposition_and_route");

  let routedPositions = positions;
  let routes: Map<number, { fromSide: CanvasConnector["fromSide"]; toSide: CanvasConnector["toSide"]; waypoints: { x: number; y: number }[] }>;
  if (reposition) {
    const origin = {
      x: Math.min(...[...positions.values()].map((rect) => rect.x)),
      y: Math.min(...[...positions.values()].map((rect) => rect.y)),
    };
    const layout = layoutSemanticDiagram(
      nodeBlocks.map((block) => ({ key: block.id, label: getBlockTopic(block), w: positions.get(block.id)!.w, h: positions.get(block.id)!.h })),
      edges,
      origin,
      direction,
    );
    routedPositions = layout.positions;
    routes = layout.routes;
  } else {
    routes = routePositionedSemanticEdges(edges, positions, direction);
  }

  const nextBlocks = { ...state.blocks };
  if (reposition) {
    routedPositions.forEach((rect, id) => {
      const block = nextBlocks[id];
      if (!block) return;
      const current = resolveTransform(block.transform, { ...rect, rotation: 0, zIndex: 0 });
      nextBlocks[id] = {
        ...block,
        transform: { computed: { ...rect, rotation: current.rotation, zIndex: current.zIndex }, override: null },
        updatedAt: Date.now(),
      };
    });
  }
  const nextConnectors = { ...state.connectors };
  edges.forEach((edge, edgeIndex) => {
    const connector = Object.values(nextConnectors).find((candidate) =>
      candidate.fromBlockId === edge.from && candidate.toBlockId === edge.to && (candidate.label ?? "") === (edge.label ?? ""));
    const route = routes.get(edgeIndex);
    if (!connector || !route || (!reposition && connector.id !== targetConnector.id)) return;
    nextConnectors[connector.id] = {
      ...connector,
      fromSide: route.fromSide,
      toSide: route.toSide,
      lineType: "orthogonal",
      arrowEnd: true,
      // Persist the improved local semantic route for AI repairs. The
      // renderer's grid router remains the interactive fallback for new or
      // manually-reset connectors, but must not be invoked for every edge of a
      // large swimlane at load time.
      waypoints: route.waypoints,
    };
  });
  useWorkspaceStore.setState({
    blocks: nextBlocks,
    connectors: nextConnectors,
    selectedBlockIds: [targetConnector.fromBlockId, targetConnector.toBlockId],
  });
  return [targetConnector.fromBlockId, targetConnector.toBlockId];
}

function flowchartAction(action: JsonMap): string[] {
  const nodes = arrayParam(action, "nodes").map(record);
  if (nodes.length === 0) return [];
  const direction: DiagramDirection = stringValue(action.direction ?? record(action.params).direction) === "right" ? "right" : "down";
  const keys = nodes.map((node, index) => stringValue(node.id) ?? `node-${index + 1}`);
  const keySet = new Set(keys);
  const explicitEdges = arrayParam(action, "edges").map(record).filter((edge) => {
    const from = edgeEndpoint(edge, "from");
    const to = edgeEndpoint(edge, "to");
    return Boolean(from && to && from !== to && keySet.has(from) && keySet.has(to));
  });
  // Keep the diagram connected when an older Dify tool schema drops the
  // optional edges field. Explicit graph edges are still authoritative.
  const edges = explicitEdges.length > 0
    ? explicitEdges
    : keys.slice(1).map((to, index) => ({ from: keys[index], to }));
  const origin = originOf();
  const sizes = new Map(keys.map((key, index) => {
    const role = roleOf(nodes[index]);
    return [key, role === "decision" ? { w: 220, h: 108 } : role === "terminator" ? { w: 190, h: 72 } : { w: 220, h: 82 }] as const;
  }));
  const layout = layoutSemanticDiagram(
    keys.map((key) => ({ key, ...sizes.get(key)! })),
    edges.map((edge) => {
      const value = record(edge);
      return { from: edgeEndpoint(value, "from")!, to: edgeEndpoint(value, "to")!, label: stringValue(value.label) ?? stringValue(value.lineLabel) };
    }),
    origin,
    direction,
  );
  const root = keys.find((key) => layout.ranks.get(key) === 0) ?? keys[0];
  const idByKey = new Map<string, string>();
  const createdIds: string[] = [];
  const current = useWorkspaceStore.getState();
  const blocks = { ...current.blocks };
  const blockOrder = [...current.blockOrder];
  const connectors = { ...current.connectors };
  const mapId = createBlockId();
  keys.forEach((key) => {
    const node = nodes[keys.indexOf(key)];
    const role = roleOf(node);
    const rect = layout.positions.get(key)!;
    const id = key === root ? mapId : createBlockId();
    idByKey.set(key, id);
    const now = Date.now();
    blocks[id] = {
      id,
      mapId,
      type: "text",
      transform: createComputedTransform({ ...rect, rotation: 0, zIndex: now }),
      data: { markdown: labelOf(node), semanticKey: key },
      style: { ...styleFor(role), ...record(node.style) },
      ...(stringValue(node.description) ? { description: stringValue(node.description) } : {}),
      ...(key === root ? { mapLayout: mapLayout("flowchart", direction) } : {}),
      createdAt: now,
      updatedAt: now,
    } as CanvasBlock;
    blockOrder.push(id);
    createdIds.push(id);
  });
  edges.forEach((edge, edgeIndex) => {
    const fromKey = edgeEndpoint(edge, "from")!;
    const toKey = edgeEndpoint(edge, "to")!;
    const from = idByKey.get(fromKey);
    const to = idByKey.get(toKey);
    if (!from || !to) return;
    const label = stringValue(edge.label) ?? stringValue(edge.lineLabel);
    const routed = layout.routes.get(edgeIndex);
    const connector: CanvasConnector = {
      id: createConnectorId(),
      fromBlockId: from,
      toBlockId: to,
      fromSide: routed?.fromSide ?? (direction === "right" ? "right" : "bottom"),
      toSide: routed?.toSide ?? (direction === "right" ? "left" : "top"),
      lineType: "orthogonal",
      arrowEnd: true,
      strokeColor: "#1e293b",
      ...(routed?.waypoints.length ? { waypoints: routed.waypoints } : {}),
      ...(label ? { label, labelColor: label.toLowerCase() === "yes" || label.toLowerCase() === "có" ? "#16a34a" : label.toLowerCase() === "no" || label.toLowerCase() === "không" ? "#dc2626" : "#1e293b" } : {}),
    };
    connectors[connector.id] = connector;
  });
  commitDiagram(blocks, blockOrder, connectors, createdIds);
  return createdIds;
}

function extendFlowchartAction(action: JsonMap): string[] {
  const target = resolveDiagramEndpoint(action.target ?? record(action.params).target);
  if (!target) return [];
  const state = useWorkspaceStore.getState();
  const rootId = findMapRootId(state.blocks, target);
  if (!rootId || state.blocks[rootId]?.mapLayout?.family !== "flowchart") return [];
  const mapId = state.blocks[rootId]?.mapId ?? rootId;
  const mapIds = blockIdsInMap(state.blocks, rootId);
  const byKey = new Map<string, string>();
  [...mapIds].forEach((id) => {
    const block = state.blocks[id];
    if (!block || block.type === "table") return;
    byKey.set(id, id);
    const label = getBlockTopic(block).trim();
    if (label) byKey.set(label.toLowerCase(), id);
    const semanticKey = stringValue(record(block.data).semanticKey);
    if (semanticKey) byKey.set(semanticKey.toLowerCase(), id);
  });
  const resolveKey = (value: unknown): string | undefined => {
    const key = stringValue(value);
    return key ? byKey.get(key) ?? byKey.get(key.toLowerCase()) : undefined;
  };
  const blocks = { ...state.blocks };
  const blockOrder = [...state.blockOrder];
  const connectors = { ...state.connectors };
  const createdIds: string[] = [];
  arrayParam(action, "nodes").map(record).forEach((node) => {
    const label = labelOf(node);
    const requestedKey = stringValue(node.id) ?? label;
    if (!label || resolveKey(requestedKey) || resolveKey(label)) return;
    const id = createBlockId();
    const role = roleOf(node);
    const rootRect = resolveTransform(state.blocks[rootId].transform, { x: 80, y: 80, w: 220, h: 82, rotation: 0, zIndex: 0 });
    const now = Date.now();
    blocks[id] = {
      id,
      mapId,
      type: "text",
      transform: createComputedTransform({ x: rootRect.x, y: rootRect.y, w: 220, h: role === "decision" ? 108 : role === "terminator" ? 72 : 82, rotation: 0, zIndex: now }),
      data: { markdown: label, semanticKey: requestedKey },
      style: { ...styleFor(role), ...record(node.style) },
      ...(stringValue(node.description) ? { description: stringValue(node.description) } : {}),
      createdAt: now,
      updatedAt: now,
    } as CanvasBlock;
    blockOrder.push(id);
    createdIds.push(id);
    byKey.set(requestedKey.toLowerCase(), id);
    byKey.set(label.toLowerCase(), id);
  });

  const nodeIds = new Set([...mapIds, ...createdIds].filter((id) => blocks[id]?.type !== "table"));
  const edges = Object.values(connectors)
    .filter((edge) => nodeIds.has(edge.fromBlockId) && nodeIds.has(edge.toBlockId))
    .map((edge) => ({ from: edge.fromBlockId, to: edge.toBlockId, label: edge.label }));
  arrayParam(action, "edges").map(record).forEach((edge) => {
    const from = resolveKey(edge.from ?? edge.source);
    const to = resolveKey(edge.to ?? edge.target);
    if (!from || !to || from === to) return;
    const label = stringValue(edge.label ?? edge.lineLabel);
    if (edges.some((item) => item.from === from && item.to === to && (item.label ?? "") === (label ?? ""))) return;
    edges.push({ from, to, label });
    const id = createConnectorId();
    connectors[id] = { id, fromBlockId: from, toBlockId: to, lineType: "orthogonal", arrowEnd: true, ...(label ? { label } : {}) };
  });
  if (createdIds.length === 0 && edges.length === 0) return [];

  const requestedDirection = stringValue(action.direction ?? record(action.params).direction);
  const direction: DiagramDirection = requestedDirection === "right" || (!requestedDirection && state.blocks[rootId]?.mapLayout?.direction === "right") ? "right" : "down";
  const positions = new Map([...nodeIds].map((id) => {
    const rect = resolveTransform(blocks[id].transform, { x: 80, y: 80, w: 220, h: 82, rotation: 0, zIndex: 0 });
    return [id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h }] as const;
  }));
  const origin = { x: Math.min(...[...positions.values()].map((rect) => rect.x)), y: Math.min(...[...positions.values()].map((rect) => rect.y)) };
  const layout = layoutSemanticDiagram(
    [...nodeIds].map((id) => ({ key: id, label: getBlockTopic(blocks[id]), w: positions.get(id)!.w, h: positions.get(id)!.h })),
    edges,
    origin,
    direction,
  );
  layout.positions.forEach((rect, id) => {
    const block = blocks[id];
    if (!block) return;
    const current = resolveTransform(block.transform, { ...rect, rotation: 0, zIndex: 0 });
    blocks[id] = { ...block, transform: { computed: { ...rect, rotation: current.rotation, zIndex: current.zIndex }, override: null }, updatedAt: Date.now() };
  });
  Object.values(connectors).forEach((connector) => {
    if (!nodeIds.has(connector.fromBlockId) || !nodeIds.has(connector.toBlockId)) return;
    const edgeIndex = edges.findIndex((edge) => edge.from === connector.fromBlockId && edge.to === connector.toBlockId && (edge.label ?? "") === (connector.label ?? ""));
    const route = edgeIndex >= 0 ? layout.routes.get(edgeIndex) : undefined;
    if (!route) return;
    connectors[connector.id] = { ...connector, fromSide: route.fromSide, toSide: route.toSide, lineType: "orthogonal", arrowEnd: true, waypoints: route.waypoints };
  });
  blocks[rootId] = { ...blocks[rootId], mapLayout: mapLayout("flowchart", direction), updatedAt: Date.now() };
  commitDiagram(blocks, blockOrder, connectors, [rootId, ...createdIds]);
  return [rootId, ...createdIds];
}

function swimlaneAction(action: JsonMap): string[] {
  const lanes = arrayParam(action, "lanes").map(record).map((lane, index) => ({ id: stringValue(lane.id) ?? `lane-${index + 1}`, label: labelOf(lane) })).filter((lane) => lane.label);
  const nodes = arrayParam(action, "nodes").map(record);
  if (!lanes.length || !nodes.length) return [];
  const orientation: SwimlaneOrientation = stringValue(action.orientation ?? record(action.params).orientation) === "vertical" ? "vertical" : "horizontal";
  const origin = originOf();
  const current = useWorkspaceStore.getState();
  const blocks = { ...current.blocks };
  const blockOrder = [...current.blockOrder];
  const connectors = { ...current.connectors };
  const mapId = createBlockId();
  const laneMap = new Map(lanes.map((lane, index) => [lane.id, index]));
  const byLane = new Map<string, JsonMap[]>();
  nodes.forEach((node) => {
    const laneId = laneMap.has(stringValue(node.laneId) ?? "") ? stringValue(node.laneId)! : lanes[0].id;
    byLane.set(laneId, [...(byLane.get(laneId) ?? []), node]);
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
  const now = Date.now();
  blocks[mapId] = {
    id: mapId,
    mapId,
    type: "table",
    transform: createComputedTransform({ x: origin.x, y: origin.y, w: tableW, h: tableH, rotation: 0, zIndex: now }),
    data: orientation === "horizontal"
      ? { rows: lanes.length, cols: 2, cells: lanes.map((lane) => [lane.label, ""]), headerCol: true, rowWeights: lanes.map(() => laneThickness), colWeights: [130, bodyLength], passThroughEmptyCellClicks: true, disableCellAttachment: true }
      : { rows: 2, cols: lanes.length, cells: [lanes.map((lane) => lane.label), lanes.map(() => "")], headerRow: true, rowWeights: [130, bodyLength], colWeights: lanes.map(() => laneThickness), passThroughEmptyCellClicks: true, disableCellAttachment: true },
    style: { borderColor: "#94a3b8", backgroundColor: "transparent" },
    mapLayout: mapLayout("swimlane", orientation === "horizontal" ? "right" : "down"),
    createdAt: now,
    updatedAt: now,
  } as CanvasBlock;
  blockOrder.push(mapId);
  const idByKey = new Map<string, string>();
  const rectByKey = new Map<string, { x: number; y: number; w: number; h: number }>();
  const createdIds = [mapId];
  lanes.forEach((lane, laneIndex) => {
    (byLane.get(lane.id) ?? []).forEach((node, stepIndex) => {
      const id = createBlockId();
      const rect = orientation === "horizontal"
        ? { x: origin.x + 130 + padding + stepIndex * (stepW + gap), y: origin.y + laneIndex * laneThickness + (laneThickness - stepH) / 2, w: stepW, h: stepH }
        : { x: origin.x + laneIndex * laneThickness + (laneThickness - stepW) / 2, y: origin.y + 130 + padding + stepIndex * (stepH + gap), w: stepW, h: stepH };
      const key = stringValue(node.id) ?? `${lane.id}-${stepIndex}`;
      idByKey.set(key, id);
      rectByKey.set(key, rect);
      blocks[id] = {
        id,
        mapId,
        type: "shape",
        transform: createComputedTransform({ ...rect, rotation: 0, zIndex: stepIndex + 1 }),
        data: { shapeKind: roleOf(node) === "decision" ? "diamond" : "rounded_rect", label: labelOf(node) },
        style: { ...styleFor(roleOf(node)), backgroundColor: "#ffffff" },
        createdAt: now,
        updatedAt: now,
      } as CanvasBlock;
      blockOrder.push(id);
      createdIds.push(id);
    });
  });
  const keys = [...idByKey.keys()];
  const edgeSource = arrayParam(action, "edges").map(record);
  const explicitEdges = edgeSource.map((edge) => ({
    edge,
    from: edgeEndpoint(edge, "from"),
    to: edgeEndpoint(edge, "to"),
  })).filter((value): value is { edge: JsonMap; from: string; to: string } => Boolean(
    value.from && value.to && value.from !== value.to && rectByKey.has(value.from) && rectByKey.has(value.to),
  ));
  const semanticEdges: Array<{ from: string; to: string; label?: string }> = explicitEdges.length > 0
    ? explicitEdges.map(({ edge, from, to }) => ({ from, to, label: stringValue(edge.label) ?? stringValue(edge.lineLabel) }))
    : keys.slice(1).map((to, index) => ({ from: keys[index], to }));
  const routes = routePositionedSemanticEdges(
    semanticEdges,
    rectByKey,
    orientation === "horizontal" ? "right" : "down",
  );
  semanticEdges.forEach((semanticEdge, edgeIndex) => {
    const from = idByKey.get(semanticEdge.from);
    const to = idByKey.get(semanticEdge.to);
    if (!from || !to) return;
    const routed = routes.get(edgeIndex);
    const connectorId = createConnectorId();
    connectors[connectorId] = {
      id: connectorId,
      fromBlockId: from,
      toBlockId: to,
      fromSide: routed?.fromSide ?? (orientation === "horizontal" ? "right" : "bottom"),
      toSide: routed?.toSide ?? (orientation === "horizontal" ? "left" : "top"),
      lineType: "orthogonal",
      arrowEnd: true,
      strokeColor: "#1e293b",
      ...(routed?.waypoints.length ? { waypoints: routed.waypoints } : {}),
      ...(semanticEdge.label ? { label: semanticEdge.label } : {}),
    };
  });
  commitDiagram(blocks, blockOrder, connectors, createdIds);
  return createdIds;
}

export function applyWorkspaceChatDiagramAction(action: JsonMap): string[] {
  const type = String(action.type ?? "").toLowerCase();
  if (type === "create_flowchart") return flowchartAction(action);
  if (type === "extend_flowchart") return extendFlowchartAction(action);
  if (type === "create_swimlane") return swimlaneAction(action);
  if (type === "repair_connector" || type === "repair_flowchart") return repairFlowchartAction(action);
  return [];
}
