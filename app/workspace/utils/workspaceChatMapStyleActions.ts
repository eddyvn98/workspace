import type { WorkspaceConnectorLineType } from "../connectors/connectorStyle";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { asRecord, firstString, resolveWorkspaceTargetIds } from "./workspaceChatResolver";
import { blockIdsInMap, findMapRootId } from "../layout/mapRoot";
import { applyWorkspaceMapLayoutPatch } from "../layout/applyMapLayoutPatch";
import { layoutSemanticDiagram, routePositionedSemanticEdges } from "../layout/semanticDiagramLayout";
import { resolveTransform } from "../types/block";
import { normalizeWorkspaceMapLayoutType } from "./workspaceMapLayoutContract";

import type { BlockId, MapLayoutFamily, MapLayoutSettings } from "../types/block";

type WorkspaceLayoutFamily = MapLayoutFamily;
const FAMILIES: Record<string, WorkspaceLayoutFamily> = {
  "logical-right": "hierarchy", "logical-left": "hierarchy", mindmap: "hierarchy", "mindmap-vertical": "hierarchy",
  catalog: "treeview", treeview: "treeview", outline: "treeview", "org-chart": "orgchart", timeline: "timeline", "vertical-timeline": "timeline", fishbone: "fishbone",
  flowchart: "flowchart", swimlane: "swimlane",
};
const DIRECTIONS = new Set(["right", "left", "down", "up"]);
const GROWTH_MODES = new Set(["one-side", "both-side"]);
const PALETTES = new Set(["default", "pastel", "minimal", "monochrome", "vibrant"]);

function reflowSemanticFlowchart(rootId: BlockId, direction: "down" | "right"): void {
  const state = useWorkspaceStore.getState();
  const ids = blockIdsInMap(state.blocks, rootId);
  const nodeIds = new Set([...ids].filter((id) => state.blocks[id]?.type !== "table"));
  const edges = Object.values(state.connectors)
    .filter((connector) => nodeIds.has(connector.fromBlockId) && nodeIds.has(connector.toBlockId))
    .map((connector) => ({ from: connector.fromBlockId, to: connector.toBlockId, label: connector.label }));
  if (nodeIds.size < 2 || edges.length === 0) return;

  const currentPositions = new Map([...nodeIds].map((id) => {
    const rect = resolveTransform(state.blocks[id].transform, { x: 0, y: 0, w: 220, h: 82, rotation: 0, zIndex: 0 });
    return [id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h }] as const;
  }));
  const origin = {
    x: Math.min(...[...currentPositions.values()].map((rect) => rect.x)),
    y: Math.min(...[...currentPositions.values()].map((rect) => rect.y)),
  };
  const layout = layoutSemanticDiagram(
    [...currentPositions.entries()].map(([key, rect]) => ({ key, label: typeof asRecord(state.blocks[key]?.data).markdown === "string" ? asRecord(state.blocks[key]?.data).markdown as string : undefined, w: rect.w, h: rect.h })),
    edges,
    origin,
    direction,
  );
  layout.positions.forEach((rect, id) => {
    state.updateBlockTransform(id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, "computed");
  });
  const routes = routePositionedSemanticEdges(edges, layout.positions, direction);
  const nextConnectors = { ...useWorkspaceStore.getState().connectors };
  Object.values(nextConnectors).forEach((connector) => {
    const edgeIndex = edges.findIndex((edge) => edge.from === connector.fromBlockId && edge.to === connector.toBlockId && (edge.label ?? "") === (connector.label ?? ""));
    const route = edgeIndex >= 0 ? routes.get(edgeIndex) : undefined;
    if (!route) return;
    nextConnectors[connector.id] = { ...connector, fromSide: route.fromSide, toSide: route.toSide, lineType: "orthogonal", arrowEnd: true, waypoints: route.waypoints };
  });
  useWorkspaceStore.setState({ connectors: nextConnectors });
}

function styleSource(raw: Record<string, unknown>): Record<string, unknown> {
  const params = asRecord(raw.params);
  return { ...asRecord(params.style), ...asRecord(raw.style), ...raw };
}

/** Every map keeps its own layout settings on its root block (see
 *  applyMapLayoutPatch.ts) — so an update must first land on exactly ONE
 *  map, never the whole board. Prefers an explicit `target`; falls back to
 *  the current selection. Ambiguous (blocks from more than one map) or
 *  empty resolves to null — the caller then does nothing rather than
 *  guessing which map was meant. */
function resolveTargetMapRootId(raw: Record<string, unknown>): BlockId | null {
  const state = useWorkspaceStore.getState();
  const targetIds = resolveWorkspaceTargetIds(raw, { allowMultiple: true });
  const ids = targetIds.length > 0 ? targetIds : state.selectedBlockIds;
  if (ids.length === 0) return null;
  const roots = new Set(ids.map((id) => findMapRootId(state.blocks, id)).filter((id): id is BlockId => Boolean(id)));
  return roots.size === 1 ? [...roots][0] : null;
}

export function applyWorkspaceMapStyleChatAction(raw: Record<string, unknown>): string[] {
  const source = styleSource(raw);
  const layoutType = normalizeWorkspaceMapLayoutType(firstString(source.layoutType, source.layout));
  const family = layoutType ? FAMILIES[layoutType] : undefined;
  const direction = firstString(source.layoutDirection, source.direction);
  const growthMode = firstString(source.layoutGrowthMode, source.growthMode);
  const palette = firstString(source.connectorPaletteId, source.stylePresetId);
  const timelineBranchMode = firstString(source.timelineBranchMode);
  const timelineDescendantStyle = firstString(source.timelineDescendantStyle);
  const catalogDescendantStyle = firstString(source.catalogDescendantStyle);
  const requestedConnection = firstString(source.connectionStyle)?.toLowerCase();
  const connectionStyle: WorkspaceConnectorLineType | undefined = requestedConnection === "straight_arrow"
    ? "straight"
    : requestedConnection === "straight" || requestedConnection === "curved" || requestedConnection === "orthogonal"
      ? requestedConnection
      : undefined;

  if (!family && !DIRECTIONS.has(direction ?? "") && !GROWTH_MODES.has(growthMode ?? "") && !connectionStyle && !PALETTES.has(palette ?? "") && !timelineBranchMode && !timelineDescendantStyle && !catalogDescendantStyle) return [];

  const rootId = resolveTargetMapRootId(raw);
  if (!rootId) return [];

  const patch: Partial<MapLayoutSettings> = {};
  if (family) patch.family = family;
  if (direction && DIRECTIONS.has(direction)) patch.direction = direction as MapLayoutSettings["direction"];
  if (growthMode && GROWTH_MODES.has(growthMode)) patch.growthMode = growthMode as MapLayoutSettings["growthMode"];
  const targetFamily = family ?? useWorkspaceStore.getState().blocks[rootId]?.mapLayout?.family ?? "hierarchy";
  if (connectionStyle && targetFamily === "hierarchy") patch.connectorLineType = connectionStyle;
  if (palette && PALETTES.has(palette)) {
    patch.connectorPaletteId = palette;
    patch.stylePresetId = palette;
  }
  if (timelineBranchMode && ["auto", "one-side", "one-side-reverse", "alternate"].includes(timelineBranchMode)) {
    patch.timelineBranchMode = timelineBranchMode as MapLayoutSettings["timelineBranchMode"];
  }
  if (timelineDescendantStyle === "tree" || timelineDescendantStyle === "hierarchy") patch.timelineDescendantStyle = timelineDescendantStyle;
  if (catalogDescendantStyle === "tree" || catalogDescendantStyle === "hierarchy") patch.catalogDescendantStyle = catalogDescendantStyle;
  if (Object.keys(patch).length === 0) return [];

  applyWorkspaceMapLayoutPatch(rootId, patch);
  if ((family === "flowchart" || !family) && direction && (direction === "down" || direction === "right")) {
    reflowSemanticFlowchart(rootId, direction);
  }

  return [...blockIdsInMap(useWorkspaceStore.getState().blocks, rootId)];
}
