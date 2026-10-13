import { computeFlowchartTreeLayout } from "@/app/workspace/layout/flowchartLayout";
import { layoutSemanticDiagram, routePositionedSemanticEdges } from "@/app/workspace/layout/semanticDiagramLayout";
import type { AgentBoardState } from "./operationsCore";
import { blockRect, mapRoot, now, record, repairParam, resolveId, stringValue, topic, transform, writeTransform, type CanvasRect } from "./operationsCore";
import type { JsonMap } from "./operationsTables";
/**
 * The browser layout picker reflows a flowchart after changing its family.
 * Dify calls this route directly, so it has to do the same work here; merely
 * persisting `mapLayout.family = "flowchart"` leaves server-created children
 * at their generic fallback coordinates and wires crossing other maps.
 */
export function arrangeFlowchartMap(state: AgentBoardState, rootId: string, direction: "down" | "right"): void {
  const mapIds = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    Object.values(state.blocks).forEach((block) => {
      if (typeof block.parentId === "string" && mapIds.has(block.parentId) && !mapIds.has(String(block.id))) {
        mapIds.add(String(block.id));
        changed = true;
      }
    });
  }

  const childrenByParent = new Map<string, string[]>();
  const sizes = new Map<string, { w: number; h: number }>();
  mapIds.forEach((blockId) => {
    const block = state.blocks[blockId];
    if (!block) return;
    const rect = blockRect(block);
    sizes.set(blockId, { w: rect.w, h: rect.h });
    if (typeof block.parentId === "string" && mapIds.has(block.parentId)) {
      const children = childrenByParent.get(block.parentId) ?? [];
      children.push(blockId);
      childrenByParent.set(block.parentId, children);
    }
  });

  // Keep a newly generated map clear of every pre-existing map. This is the
  // server equivalent of the client create-map placement gap.
  const otherMapMaxX = Object.values(state.blocks)
    .filter((block) => !mapIds.has(String(block.id)))
    .reduce((max, block) => Math.max(max, blockRect(block).x + blockRect(block).w), 0);
  const rootRect = blockRect(state.blocks[rootId]);
  const originX = Math.max(rootRect.x, otherMapMaxX > 0 ? otherMapMaxX + 240 : rootRect.x);
  const originY = Math.max(rootRect.y, 80);
  const positions = computeFlowchartTreeLayout(
    rootId,
    originX,
    originY,
    childrenByParent,
    sizes,
    { direction, columnGap: 180, rowGap: 90 },
  );

  positions.forEach((point, blockId) => {
    const block = state.blocks[blockId];
    if (block) writeTransform(block, { x: point.x, y: point.y });
  });

  Object.values(state.connectors).forEach((link) => {
    if (!mapIds.has(String(link.fromBlockId)) || !mapIds.has(String(link.toBlockId))) return;
    if (state.blocks[String(link.toBlockId)]?.parentId !== link.fromBlockId) return;
    link.lineType = "orthogonal";
    link.arrowEnd = true;
  });
}

/** Re-layout a free-form flowchart from its persisted semantic graph. Unlike
 * a tree map, its nodes have no parentId, so map membership comes from mapId
 * and its graph comes from the connectors themselves. */
export function arrangeSemanticFlowchartMap(state: AgentBoardState, rootId: string, direction: "down" | "right"): boolean {
  const root = state.blocks[rootId];
  const mapId = stringValue(root?.mapId);
  const nodeBlocks = Object.values(state.blocks).filter((block) =>
    String(block.id) === rootId || (mapId && String(block.mapId ?? "") === mapId),
  );
  // Workspace blocks are persisted in JSONB, whose object-key order is not a
  // semantic order (Postgres commonly returns UUID keys sorted differently
  // from insertion order). The flowchart ranker uses key order to break retry
  // cycles, so always restore the user's canonical blockOrder before laying
  // out a graph. Without this, a decision node can become a false source and
  // the entire diagram shifts into a misleading zig-zag.
  const order = new Map(state.blockOrder.map((blockId, index) => [String(blockId), index]));
  nodeBlocks.sort((a, b) => (order.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) - (order.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER));
  const nodeIds = new Set(nodeBlocks.map((block) => String(block.id)));
  const diagramEdges = Object.values(state.connectors)
    .filter((link) => nodeIds.has(String(link.fromBlockId)) && nodeIds.has(String(link.toBlockId)))
    .map((link) => ({
      from: String(link.fromBlockId),
      to: String(link.toBlockId),
      label: stringValue(link.label),
    }));
  if (nodeBlocks.length < 2 || diagramEdges.length === 0) return false;

  const currentRects = new Map(nodeBlocks.map((block) => [String(block.id), blockRect(block)]));
  const origin = {
    x: Math.min(...[...currentRects.values()].map((rect) => rect.x)),
    y: Math.min(...[...currentRects.values()].map((rect) => rect.y)),
  };
  const layout = layoutSemanticDiagram(
    nodeBlocks.map((block) => ({ key: String(block.id), label: topic(block), w: currentRects.get(String(block.id))!.w, h: currentRects.get(String(block.id))!.h })),
    diagramEdges,
    origin,
    direction,
  );
  layout.positions.forEach((rect, blockId) => {
    const block = state.blocks[blockId];
    if (block) writeTransform(block, { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
  });
  const routes = routePositionedSemanticEdges(diagramEdges, layout.positions, direction);
  Object.values(state.connectors).forEach((link) => {
    const edgeIndex = diagramEdges.findIndex((edge) => edge.from === String(link.fromBlockId) && edge.to === String(link.toBlockId) && (edge.label ?? "") === (stringValue(link.label) ?? ""));
    if (edgeIndex < 0) return;
    const routed = routes.get(edgeIndex);
    link.lineType = "orthogonal";
    link.arrowEnd = true;
    if (routed) {
      link.fromSide = routed.fromSide;
      link.toSide = routed.toSide;
      link.waypoints = routed.waypoints;
    }
  });
  return true;
}

/** Repair one selectable workspace connector. The agent names semantic
 * endpoints and a strategy; this server-side applier owns the actual route.
 * Flowcharts may be re-laid out; swimlane/table geometry is preserved while
 * its connector is rerouted inside the existing lanes. */
export function repairSemanticFlowchart(state: AgentBoardState, raw: JsonMap): string[] {
  const connectorId = stringValue(repairParam(raw, "connectorId"));
  const fromValue = repairParam(raw, "from") ?? repairParam(raw, "source");
  const toValue = repairParam(raw, "to") ?? repairParam(raw, "destination");
  const fromId = resolveId({ target: fromValue }, state);
  const toId = resolveId({ target: toValue }, state);
  const label = stringValue(repairParam(raw, "label")) ?? stringValue(repairParam(raw, "lineLabel"));
  const endpointMatches = Object.values(state.connectors).filter((link) => {
    if (!fromId || !toId || String(link.fromBlockId) !== fromId || String(link.toBlockId) !== toId) return false;
    return true;
  });
  const labelledMatches = label
    ? endpointMatches.filter((link) => stringValue(link.label)?.toLowerCase() === label.toLowerCase())
    : endpointMatches;
  const target = connectorId
    ? Object.values(state.connectors).find((link) => String(link.id) === connectorId)
    : labelledMatches[0] ?? (endpointMatches.length === 1 ? endpointMatches[0] : undefined);
  /*
   * Dify versions differ in whether function arguments arrive at the action
   * root, under params, or inside a target object. If from/to identify one
   * connector, a cosmetic label variation must not turn a valid repair into
   * a 422; the label is only a disambiguator when multiple parallel links
   * share the same endpoints.
   */
  const resolvedTarget = target ?? Object.values(state.connectors).find((link) => {
    if (connectorId) return String(link.id) === connectorId;
    if (!fromId || !toId || String(link.fromBlockId) !== fromId || String(link.toBlockId) !== toId) return false;
    return !label || stringValue(link.label)?.toLowerCase() === label.toLowerCase();
  });
  if (!resolvedTarget) return [];

  const candidateRootId = mapRoot(state, String(resolvedTarget.fromBlockId));
  const candidateRoot = state.blocks[candidateRootId];
  // mapRoot keeps legacy parent chains working and therefore may return the
  // block itself for a standalone connector. Only treat it as a diagram root
  // when it actually carries map metadata; otherwise route just this free
  // connector against the surrounding canvas blocks.
  const rootId = candidateRoot && (record(candidateRoot.mapLayout).family || candidateRoot.mapId)
    ? candidateRootId
    : "";
  const root = rootId ? state.blocks[rootId] : undefined;
  const family = root ? stringValue(record(root.mapLayout).family) : undefined;
  const structural = String(state.blocks[String(resolvedTarget.toBlockId)]?.parentId ?? "") === String(resolvedTarget.fromBlockId);
  if (structural && family !== "flowchart" && family !== "swimlane") return [];
  const mapId = root ? stringValue(root.mapId) : undefined;
  const nodeBlocks = Object.values(state.blocks).filter((block) =>
    root
      ? (String(block.id) === rootId || (mapId && String(block.mapId ?? "") === mapId))
      : block.type !== "table",
  ).filter((block) => block.type !== "table");
  if (nodeBlocks.length < 2) return [];
  const nodeIds = new Set(nodeBlocks.map((block) => String(block.id)));
  const currentRects = new Map(nodeBlocks.map((block) => [String(block.id), blockRect(block)]));
  const routedConnectors = Object.values(state.connectors)
    .filter((link) => nodeIds.has(String(link.fromBlockId)) && nodeIds.has(String(link.toBlockId)))
    .filter((link) => Boolean(root) || String(link.id) === String(resolvedTarget.id));
  const edges = routedConnectors.map((link) => ({
    from: String(link.fromBlockId),
    to: String(link.toBlockId),
    label: stringValue(link.label),
  }));
  const requestedDirection = stringValue(repairParam(raw, "direction"))
    ?? (record(root?.mapLayout).direction === "right" ? "right" : "down");
  const direction: "right" | "down" = requestedDirection === "right" ? "right" : "down";
  const strategy = (stringValue(repairParam(raw, "strategy")) ?? "reroute_only").toLowerCase().replace(/[\s-]+/g, "_");
  const reposition = family === "flowchart" && (strategy === "reposition_and_reroute" || strategy === "reposition" || strategy === "reflow" || strategy === "reposition_and_route");

  let positions = currentRects;
  let routes: Map<number, { fromSide: "top" | "right" | "bottom" | "left" | "center"; toSide: "top" | "right" | "bottom" | "left" | "center"; waypoints: { x: number; y: number }[] }>;
  if (reposition) {
    const origin = {
      x: Math.min(...[...currentRects.values()].map((rect) => rect.x)),
      y: Math.min(...[...currentRects.values()].map((rect) => rect.y)),
    };
    const layout = layoutSemanticDiagram(
      nodeBlocks.map((block) => ({ key: String(block.id), label: topic(block), w: currentRects.get(String(block.id))!.w, h: currentRects.get(String(block.id))!.h })),
      edges,
      origin,
      direction,
    );
    positions = layout.positions;
    routes = layout.routes;
  } else {
    routes = routePositionedSemanticEdges(edges, currentRects, direction);
  }

  if (reposition) {
    positions.forEach((rect, blockId) => {
      const block = state.blocks[blockId];
      if (!block) return;
      const currentTransform = transform(block);
      writeTransform(block, { ...rect, rotation: Number(currentTransform.rotation) || 0, zIndex: Number(currentTransform.zIndex) || 0 });
      block.updatedAt = now();
    });
  }

  const changedIds = new Set<string>();
  if (reposition) positions.forEach((_rect, blockId) => changedIds.add(blockId));
  routes.forEach((route, edgeIndex) => {
    const link = routedConnectors[edgeIndex];
    if (!link || !route || (!reposition && String(link.id) !== String(resolvedTarget.id))) return;
    link.fromSide = route.fromSide;
    link.toSide = route.toSide;
    link.lineType = "orthogonal";
    link.arrowEnd = true;
    // Persist the improved local semantic route. The live renderer remains
    // the interactive fallback after Reset bends, but large swimlanes should
    // not run a grid search for every connector during hydration.
    link.waypoints = route.waypoints;
    changedIds.add(String(link.id));
  });
  return [...changedIds];
}
