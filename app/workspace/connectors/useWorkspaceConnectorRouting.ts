import { useMemo, useRef } from "react";
import type { BlockId, CanvasBlock } from "../types/block";
import type { CanvasConnector } from "../types/connector";
import type { WorkspaceStore } from "../store/useWorkspaceStore";
import { computeConnectorGeometry } from "./connectorGeometry";
import { orthogonalPathObstacles } from "./orthogonalPathObstacles";
import { GRID_SEARCH_MARGIN } from "./connectorRouting";
import { currentMapLayout, findMapRootId } from "../layout/mapRoot";
import { applySharedTrunkRouting } from "./sharedTrunkRouting";
import { buildFishboneConnectorPath, collectFishboneRibPaths } from "./fishboneConnectorPath";
import { buildTimelineConnectorPath, collectTimelineAxisPaths } from "./timelineConnectorPath";
import { buildTreeviewConnectorPath } from "./treeviewConnectorPath";
import type { StyledConnectorAuxiliaryPath } from "./connectorAuxiliaryPathTypes";
import { styleWorkspaceAuxiliaryPath } from "./workspaceAuxiliaryPathStyle";
import type { ConnectorStrokeGeometry } from "./WorkspaceConnectorStroke";
import { resolveStructuralConnectorSides } from "./structuralConnectorSides";
import { IDENTITY_CAMERA } from "./connectorPointer";
import { blockWorldRect } from "./blockWorldRect";
import { avoidWorkspaceLineNodeOverlaps, type WorkspaceLineNode } from "./connectorLineNodeAvoidance";
import {
  createWorkspaceLayoutRotationContext,
  inverseRotateWorkspacePoint,
  inverseRotateWorkspaceRect,
  reprojectRotatedWorkspacePath,
  rotateWorkspacePathD,
} from "../layout/layoutRotation";

type LayoutState = Pick<WorkspaceStore, "blocks" | "treeLayoutFamily" | "treeLayoutDirection" | "treeGrowthMode" | "treeConnectorLineType" | "treeConnectorPaletteId" | "treeTimelineBranchMode" | "treeTimelineDescendantStyle" | "treeCatalogDescendantStyle">;

interface WorkspaceConnectorRoutingArgs {
  blocks: Record<BlockId, CanvasBlock>;
  connectors: WorkspaceStore["connectors"];
  layoutState: LayoutState;
  hiddenBlocks: ReadonlySet<BlockId>;
  blockOrder: BlockId[];
  isDraggingBlock: boolean;
  draggedBlockIds: BlockId[];
  anchorRegistryVersion: number;
  visibleBlockIds?: ReadonlySet<string>;
}

export function useWorkspaceConnectorRouting({
  blocks,
  connectors,
  layoutState,
  hiddenBlocks,
  blockOrder,
  isDraggingBlock,
  draggedBlockIds,
  anchorRegistryVersion,
  visibleBlockIds,
}: WorkspaceConnectorRoutingArgs) {
  const isCanvasDrag = isDraggingBlock;
  const dragRoutingRef = useRef<{
    fishboneRibPaths: StyledConnectorAuxiliaryPath[];
    timelineAxisPaths: StyledConnectorAuxiliaryPath[];
    connectorGeometries: ConnectorStrokeGeometry[];
    allPathInputs: { id: string; d: string }[];
  } | null>(null);

  // Connector routing is authored in world/canvas units. Camera-only changes
  // therefore skip this memo and only move the shared camera transform.
  return useMemo(() => {
    // This version invalidates geometry cached outside React's block store.
    void anchorRegistryVersion;
    const originX = 0;
    const originY = 0;
    const worldRect = (blockId: string) => blockWorldRect(blocks, blockId);
    const mapRootIdCache = new Map<string, string | null>();
    const getMapRootId = (blockId: string) => {
      if (mapRootIdCache.has(blockId)) return mapRootIdCache.get(blockId) ?? null;
      const rootId = findMapRootId(blocks, blockId);
      mapRootIdCache.set(blockId, rootId);
      return rootId;
    };
    const buildLiveGeometryEntry = (connector: CanvasConnector) => {
      if (hiddenBlocks.has(connector.fromBlockId) || hiddenBlocks.has(connector.toBlockId)) return null;
      const fromRect = worldRect(connector.fromBlockId);
      const toRect = worldRect(connector.toBlockId);
      if (!fromRect || !toRect) return null;
      const layout = currentMapLayout(layoutState, connector.fromBlockId);
      const mapRootId = getMapRootId(connector.fromBlockId);
      const rootRect = mapRootId ? worldRect(mapRootId) : null;
      const rotation = createWorkspaceLayoutRotationContext(layout, rootRect);
      const nativeRect = (blockId: string) => {
        const rect = worldRect(blockId);
        return rotation && mapRootId && getMapRootId(blockId) === mapRootId
          ? (rect ? inverseRotateWorkspaceRect(rect, rotation) : null)
          : rect;
      };
      const routingConnector = rotation
        ? { ...connector, waypoints: connector.waypoints?.map((point) => inverseRotateWorkspacePoint(point, rotation)) }
        : connector;
      const structuralSides = resolveStructuralConnectorSides(connector, fromRect, toRect, blocks, layout);
      const geometry = computeConnectorGeometry(routingConnector, nativeRect(connector.fromBlockId) ?? fromRect, nativeRect(connector.toBlockId) ?? toRect, blocks, IDENTITY_CAMERA, originX, originY, structuralSides, nativeRect);
      const fishbone = layout.family === "fishbone" ? buildFishboneConnectorPath(connector, blocks, worldRect, originX, originY) : null;
      const timeline = layout.family === "timeline" ? buildTimelineConnectorPath(routingConnector, blocks, nativeRect, layout.direction === "up" || layout.direction === "down" ? "vertical" : "horizontal", layout.timelineDescendantStyle ?? "tree", originX, originY, blockOrder) : null;
      const treeview = layout.family === "treeview" ? buildTreeviewConnectorPath(connector, blocks, worldRect, layout.direction, layout.catalogDescendantStyle === "hierarchy" ? "hierarchy" : "stacked", originX, originY) : null;
      const custom = fishbone ?? timeline ?? treeview;
      const nativePathD = custom?.path ?? geometry.pathD ?? `M ${geometry.x1} ${geometry.y1} L ${geometry.x2} ${geometry.y2}`;
      const nativeGeometry = custom ? { ...geometry, x1: custom.start.x, y1: custom.start.y, x2: custom.end.x, y2: custom.end.y, pathD: nativePathD } : { ...geometry, pathD: nativePathD };
      const effectiveGeometry = rotation
        ? (() => {
          const rotated = reprojectRotatedWorkspacePath(nativePathD, rotation, fromRect, toRect);
          return { ...nativeGeometry, x1: rotated.start.x, y1: rotated.start.y, x2: rotated.end.x, y2: rotated.end.y, pathD: rotated.pathD };
        })()
        : nativeGeometry;
      const basePathD = effectiveGeometry.pathD ?? `M ${effectiveGeometry.x1} ${effectiveGeometry.y1} L ${effectiveGeometry.x2} ${effectiveGeometry.y2}`;
      return { connector, ...effectiveGeometry, basePathD };
    };
    if (isCanvasDrag && dragRoutingRef.current) {
      const draggedIds = new Set(draggedBlockIds);
      const cached = dragRoutingRef.current;
      const connectorGeometries = cached.connectorGeometries.map((entry) => draggedIds.has(entry.connector.fromBlockId) || draggedIds.has(entry.connector.toBlockId) ? (buildLiveGeometryEntry(entry.connector) ?? entry) : entry);
      const routedConnectorGeometries = applySharedTrunkRouting(connectorGeometries, blocks, (blockId) => currentMapLayout(layoutState, blockId));
      const allPathInputs = routedConnectorGeometries.map(({ connector, basePathD }) => ({ id: connector.id, d: basePathD }));
      return { fishboneRibPaths: cached.fishboneRibPaths, timelineAxisPaths: cached.timelineAxisPaths, connectorGeometries: routedConnectorGeometries, allPathInputs };
    }
    const isProgressive = Boolean(visibleBlockIds && visibleBlockIds.size < blockOrder.length);
    const connectorList = Object.values(connectors).filter((connector) => !visibleBlockIds || (visibleBlockIds.has(connector.fromBlockId) && visibleBlockIds.has(connector.toBlockId)));
    const priorLooseRoutes: Array<{
      fromId: string;
      toId: string;
      bounds: { left: number; right: number; top: number; bottom: number };
      obstacles: DOMRect[];
    }> = [];
    const rawGeometries = connectorList.flatMap((connector) => {
      if (hiddenBlocks.has(connector.fromBlockId) || hiddenBlocks.has(connector.toBlockId)) return [];
      const fromRect = worldRect(connector.fromBlockId);
      const toRect = worldRect(connector.toBlockId);
      if (!fromRect || !toRect) return [];
      const layout = currentMapLayout(layoutState, connector.fromBlockId);
      const mapRootId = getMapRootId(connector.fromBlockId);
      const rootRect = mapRootId ? worldRect(mapRootId) : null;
      const rotation = createWorkspaceLayoutRotationContext(layout, rootRect);
      const nativeRect = (blockId: string) => {
        const rect = worldRect(blockId);
        return rotation && mapRootId && getMapRootId(blockId) === mapRootId ? (rect ? inverseRotateWorkspaceRect(rect, rotation) : null) : rect;
      };
      const routingConnector = rotation ? { ...connector, waypoints: connector.waypoints?.map((point) => inverseRotateWorkspacePoint(point, rotation)) } : connector;
      const structuralSides = resolveStructuralConnectorSides(connector, fromRect, toRect, blocks, layout);
      const fromRootId = getMapRootId(connector.fromBlockId);
      const toRootId = getMapRootId(connector.toBlockId);
      const looseOrthogonal = connector.lineType === "orthogonal"
        && !connector.waypoints?.length
        && !structuralSides
        && fromRootId !== toRootId
        && !blocks[fromRootId ?? ""]?.mapLayout
        && !blocks[toRootId ?? ""]?.mapLayout;
      const routeObstacles = looseOrthogonal
        ? priorLooseRoutes
          .filter((route) => route.fromId !== connector.fromBlockId && route.fromId !== connector.toBlockId
            && route.toId !== connector.fromBlockId && route.toId !== connector.toBlockId
            && route.bounds.right >= Math.min(fromRect.left, toRect.left) - GRID_SEARCH_MARGIN
            && route.bounds.left <= Math.max(fromRect.right, toRect.right) + GRID_SEARCH_MARGIN
            && route.bounds.bottom >= Math.min(fromRect.top, toRect.top) - GRID_SEARCH_MARGIN
            && route.bounds.top <= Math.max(fromRect.bottom, toRect.bottom) + GRID_SEARCH_MARGIN)
          .flatMap((route) => route.obstacles)
        : [];
      const geometry = computeConnectorGeometry(routingConnector, nativeRect(connector.fromBlockId) ?? fromRect, nativeRect(connector.toBlockId) ?? toRect, blocks, IDENTITY_CAMERA, originX, originY, structuralSides, nativeRect, routeObstacles);
      const fishbone = layout.family === "fishbone" ? buildFishboneConnectorPath(connector, blocks, worldRect, originX, originY) : null;
      const timeline = layout.family === "timeline" ? buildTimelineConnectorPath(routingConnector, blocks, nativeRect, layout.direction === "up" || layout.direction === "down" ? "vertical" : "horizontal", layout.timelineDescendantStyle ?? "tree", originX, originY, blockOrder) : null;
      const treeview = layout.family === "treeview" ? buildTreeviewConnectorPath(connector, blocks, worldRect, layout.direction, layout.catalogDescendantStyle === "hierarchy" ? "hierarchy" : "stacked", originX, originY) : null;
      const custom = fishbone ?? timeline ?? treeview;
      const nativePathD = custom?.path ?? geometry.pathD ?? `M ${geometry.x1} ${geometry.y1} L ${geometry.x2} ${geometry.y2}`;
      if (looseOrthogonal && !rotation) {
        const obstacles = orthogonalPathObstacles(nativePathD);
        if (obstacles.length) {
          priorLooseRoutes.push({
            fromId: connector.fromBlockId,
            toId: connector.toBlockId,
            bounds: obstacles.reduce((bounds, obstacle) => ({
              left: Math.min(bounds.left, obstacle.left),
              right: Math.max(bounds.right, obstacle.right),
              top: Math.min(bounds.top, obstacle.top),
              bottom: Math.max(bounds.bottom, obstacle.bottom),
            }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }),
            obstacles,
          });
        }
      }
      const nativeGeometry = custom ? { ...geometry, x1: custom.start.x, y1: custom.start.y, x2: custom.end.x, y2: custom.end.y, pathD: nativePathD } : { ...geometry, pathD: nativePathD };
      const effectiveGeometry = rotation ? (() => {
        const rotated = reprojectRotatedWorkspacePath(nativePathD, rotation, fromRect, toRect);
        return { ...nativeGeometry, x1: rotated.start.x, y1: rotated.start.y, x2: rotated.end.x, y2: rotated.end.y, pathD: rotated.pathD };
      })() : nativeGeometry;
      return [{ connector, geometry: effectiveGeometry, fishbone, timeline, treeview }];
    });
    const fishboneRibPaths = isProgressive ? [] : collectFishboneRibPaths(blocks, (blockId) => currentMapLayout(layoutState, blockId).family === "fishbone", worldRect, originX, originY).map((entry) => styleWorkspaceAuxiliaryPath(entry, "fishbone", blocks, connectorList, (id) => currentMapLayout(layoutState, id)));
    const timelineAxisRect = (blockId: string) => {
      const rect = worldRect(blockId);
      const rootId = getMapRootId(blockId);
      const rootRect = rootId ? worldRect(rootId) : null;
      const layout = currentMapLayout(layoutState, blockId);
      const rotation = createWorkspaceLayoutRotationContext(layout, rootRect);
      return rotation && rect ? inverseRotateWorkspaceRect(rect, rotation) : rect;
    };
    const timelineAxisPaths = isProgressive ? [] : collectTimelineAxisPaths(blocks, (blockId) => {
      const layout = currentMapLayout(layoutState, blockId);
      return layout.family === "timeline" && (layout.direction !== "up" && layout.direction !== "down") && (layout.timelineDescendantStyle ?? "tree") === "tree";
    }, timelineAxisRect, originX, originY).map((entry) => {
      const rootId = getMapRootId(entry.parentId);
      const rootRect = rootId ? worldRect(rootId) : null;
      const rotation = createWorkspaceLayoutRotationContext(currentMapLayout(layoutState, entry.parentId), rootRect);
      const path = rotation ? rotateWorkspacePathD(entry.path, rotation) : entry.path;
      return styleWorkspaceAuxiliaryPath({ ...entry, path }, "timeline", blocks, connectorList, (id) => currentMapLayout(layoutState, id));
    });
    const routedConnectorGeometries = rawGeometries.map(({ connector, geometry, fishbone, timeline, treeview }) => ({ connector, ...geometry, basePathD: geometry.pathD ?? fishbone?.path ?? timeline?.path ?? treeview?.path ?? `M ${geometry.x1} ${geometry.y1} L ${geometry.x2} ${geometry.y2}` }));
    const bundledConnectorGeometries = applySharedTrunkRouting(routedConnectorGeometries, blocks, (blockId) => currentMapLayout(layoutState, blockId));
    const adjustedLines = isProgressive || isDraggingBlock ? new Map<string, string>() : avoidWorkspaceLineNodeOverlaps(bundledConnectorGeometries.map(({ connector, basePathD }) => ({ id: connector.id, fromBlockId: connector.fromBlockId, toBlockId: connector.toBlockId, d: basePathD })), Object.values(blocks).flatMap((block): WorkspaceLineNode[] => {
      if (hiddenBlocks.has(block.id)) return [];
      const mapRootId = getMapRootId(block.id);
      const rect = worldRect(block.id);
      if (!mapRootId || !rect) return [];
      return [{ id: block.id, mapRootId, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } }];
    }));
    const connectorGeometries = bundledConnectorGeometries.map((geometry) => ({ ...geometry, basePathD: adjustedLines.get(geometry.connector.id) ?? geometry.basePathD }));
    const allPathInputs = connectorGeometries.map(({ connector, basePathD }) => ({ id: connector.id, d: basePathD }));
    const result = { fishboneRibPaths, timelineAxisPaths, connectorGeometries, allPathInputs };
    if (!isCanvasDrag) dragRoutingRef.current = result;
    return result;
  }, [connectors, hiddenBlocks, layoutState, blocks, blockOrder, isDraggingBlock, isCanvasDrag, draggedBlockIds, anchorRegistryVersion, visibleBlockIds]);
}
