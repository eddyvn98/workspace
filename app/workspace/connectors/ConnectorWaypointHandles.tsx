"use client";
import React, { useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { pickFacingSide, pointOnRectSide } from "./anchorRegistry";
import { blockWorldRect } from "./blockWorldRect";
import { clientToWorkspaceWorld, IDENTITY_CAMERA } from "./connectorPointer";
import { computeConnectorGeometry } from "./connectorGeometry";
import { getPathMidpoint, getPathMidpointSegmentIndex, getPathPoints, getPathSegmentMidpoints } from "./connectorPath";
import { buildSharedTrunkOrthogonalPath } from "./connectorPathParity";
import { currentMapLayout, findMapRootId } from "../layout/mapRoot";
import { resolveStructuralConnectorSides } from "./structuralConnectorSides";
import { constrainOrthogonalEndpointLeads, keepOrthogonalRouteOutsideBlocks, shiftOrthogonalSegment, snapOrthogonalSegmentDelta } from "./orthogonalWaypointSnap";
import { projectConnectorPointToPath } from "./connectorWaypointProjection";
import { useWorkspaceDragAutoPan } from "../hooks/useWorkspaceDragAutoPan";
import { ConnectorWaypointHandleOverlays } from "./ConnectorWaypointHandleOverlays";
import {
  createWorkspaceLayoutRotationContext,
  inverseRotateWorkspacePoint,
  inverseRotateWorkspaceRect,
  reprojectRotatedWorkspacePath,
} from "../layout/layoutRotation";
const ORTHOGONAL_SNAP_DISTANCE_SCREEN_PX = 12;
interface DragState {
  type: "waypoint" | "segment";
  index: number;
  startMouseX: number;
  startMouseY: number;
  startWaypoints: Array<{ x: number; y: number }>;
  insertPoint?: { x: number; y: number };
  orthogonalAxis?: "horizontal" | "vertical";
  segmentEndpoints?: {
    start: { x: number; y: number };
    end: { x: number; y: number };
  };
  segmentPoints?: Array<{ x: number; y: number }>;
  segmentPoint?: { x: number; y: number };
  segmentAxis?: "x" | "y";
}
function updateConnectorWaypoints(id: string, waypoints: Array<{ x: number; y: number }> | undefined) {
  useWorkspaceStore.setState((state) => {
    if (state.isReadOnly) return state;
    const existing = state.connectors[id];
    if (!existing) return state;
    const fromRect = blockWorldRect(state.blocks, existing.fromBlockId);
    const toRect = blockWorldRect(state.blocks, existing.toBlockId);
    const lineType = existing.lineType ?? "straight";
    let nextWaypoints = waypoints;
    let nextFromSide = existing.fromSide;
    let nextToSide = existing.toSide;
    if (lineType === "orthogonal" && waypoints && waypoints.length > 0 && fromRect && toRect) {
      const layout = currentMapLayout(state, existing.fromBlockId);
      const structuralSides = resolveStructuralConnectorSides(existing, fromRect, toRect, state.blocks, layout);
      const fromSide = existing.fromSide ?? structuralSides?.fromSide ?? pickFacingSide(fromRect, toRect);
      const toSide = existing.toSide ?? structuralSides?.toSide ?? pickFacingSide(toRect, fromRect);
      nextFromSide = fromSide === "center" ? undefined : fromSide;
      nextToSide = toSide === "center" ? undefined : toSide;
      nextWaypoints = constrainOrthogonalEndpointLeads(
        waypoints,
        fromSide === "center" ? undefined : fromSide,
        toSide === "center" ? undefined : toSide,
        pointOnRectSide(fromRect, fromSide),
        pointOnRectSide(toRect, toSide),
      );
      const route = keepOrthogonalRouteOutsideBlocks([
        pointOnRectSide(fromRect, fromSide),
        ...nextWaypoints,
        pointOnRectSide(toRect, toSide),
      ], Object.keys(state.blocks)
        .map((blockId) => blockWorldRect(state.blocks, blockId))
        .filter((rect): rect is DOMRect => rect !== null));
      nextWaypoints = route.slice(1, -1);
    }
    return {
      connectors: {
        ...state.connectors,
        [id]: {
          ...existing,
          ...(lineType === "orthogonal" ? { fromSide: nextFromSide, toSide: nextToSide } : {}),
          waypoints: nextWaypoints && nextWaypoints.length > 0 ? nextWaypoints : undefined,
        },
      },
    };
  });
}
export function ConnectorWaypointHandles({ interactive = true }: { interactive?: boolean }) {
  const selectedConnectorId = useWorkspaceStore((state) => state.selectedConnectorId);
  const connectors = useWorkspaceStore((state) => state.connectors);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const camera = useWorkspaceStore((state) => state.camera);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const autoPan = useWorkspaceDragAutoPan((dx, dy) => {
    const current = dragRef.current;
    if (!current) return;
    current.startMouseX -= dx;
    current.startMouseY -= dy;
  });
  useEffect(() => () => autoPan.stop(), [autoPan]);
  useEffect(() => {
    if (!drag || !selectedConnectorId) return;
    let hasMoved = false;
    const handlePointerMove = (e: PointerEvent) => {
      autoPan.reportPointer(e.clientX, e.clientY);
      const screenDx = e.clientX - drag.startMouseX;
      const screenDy = e.clientY - drag.startMouseY;
      const zoom = useWorkspaceStore.getState().camera.zoom || 1;
      const dx = screenDx / zoom;
      const dy = screenDy / zoom;
      if (drag.type === "waypoint") {
        const next = drag.startWaypoints.map((wp, i) =>
          i === drag.index ? { x: wp.x + dx, y: wp.y + dy } : { ...wp }
        );
        updateConnectorWaypoints(selectedConnectorId, next);
      } else if (drag.segmentAxis && drag.segmentPoints && drag.segmentPoint) {
        if (!hasMoved && Math.hypot(screenDx, screenDy) < 3) return;
        hasMoved = true;
        const rawDelta = drag.segmentAxis === "x" ? dx : dy;
        const delta = snapOrthogonalSegmentDelta(
          drag.segmentPoints,
          drag.segmentPoint,
          drag.segmentAxis,
          rawDelta,
          ORTHOGONAL_SNAP_DISTANCE_SCREEN_PX / zoom,
        );
        const shiftedRoute = shiftOrthogonalSegment(
          drag.segmentPoints,
          drag.segmentPoint,
          drag.segmentAxis,
          delta,
        );
        const currentBlocks = useWorkspaceStore.getState().blocks;
        const shifted = keepOrthogonalRouteOutsideBlocks(shiftedRoute, Object.keys(currentBlocks)
          .map((blockId) => blockWorldRect(currentBlocks, blockId))
          .filter((rect): rect is DOMRect => rect !== null));
        updateConnectorWaypoints(selectedConnectorId, shifted.slice(1, -1));
      } else {
        if (!hasMoved && Math.hypot(screenDx, screenDy) < 3) return;
        hasMoved = true;
        const next = [...drag.startWaypoints];
        const pointer = clientToWorkspaceWorld({ x: e.clientX, y: e.clientY });
        next.splice(drag.index, 0, {
          x: (drag.insertPoint?.x ?? pointer.x) + dx,
          y: (drag.insertPoint?.y ?? pointer.y) + dy,
        });
        updateConnectorWaypoints(selectedConnectorId, next);
      }
    };
    const handlePointerUp = () => {
      if (drag.type === "segment" && !hasMoved && drag.insertPoint && !drag.segmentAxis) {
        const next = [...drag.startWaypoints];
        next.splice(drag.index, 0, { x: drag.insertPoint.x, y: drag.insertPoint.y });
        updateConnectorWaypoints(selectedConnectorId, next);
      }
      autoPan.stop();
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [autoPan, drag, selectedConnectorId]);
  if (!selectedConnectorId || (isReadOnly && interactive)) return null;
  const connector = connectors[selectedConnectorId];
  if (!connector) return null;

  const fromRect = blockWorldRect(blocks, connector.fromBlockId);
  const toRect = blockWorldRect(blocks, connector.toBlockId);
  if (!fromRect || !toRect) return null;
  const layout = currentMapLayout(useWorkspaceStore.getState(), connector.fromBlockId);
  const rootId = findMapRootId(blocks, connector.fromBlockId);
  const rootRect = rootId ? blockWorldRect(blocks, rootId) : null;
  const rotation = createWorkspaceLayoutRotationContext(layout, rootRect);
  const nativeRect = (blockId: string) => {
    const rect = blockWorldRect(blocks, blockId);
    return rotation && rootId && findMapRootId(blocks, blockId) === rootId
      ? (rect ? inverseRotateWorkspaceRect(rect, rotation) : null)
      : rect;
  };
  const waypoints = connector.waypoints || [];
  const hasWaypoints = waypoints.length > 0;
  const structuralSides = resolveStructuralConnectorSides(
    connector,
    fromRect,
    toRect,
    blocks,
    layout,
  );

  let fromSide = connector.fromSide;
  let toSide = connector.toSide;

  if (hasWaypoints) {
    const wp0 = waypoints[0];
    fromSide = fromSide ?? pickFacingSide(fromRect, new DOMRect(wp0.x, wp0.y, 0, 0));
    const wpLast = waypoints[waypoints.length - 1];
    toSide = toSide ?? pickFacingSide(toRect, new DOMRect(wpLast.x, wpLast.y, 0, 0));
  } else {
    fromSide = fromSide ?? structuralSides?.fromSide ?? pickFacingSide(fromRect, toRect);
    toSide = toSide ?? structuralSides?.toSide ?? pickFacingSide(toRect, fromRect);
  }

  const p1 = pointOnRectSide(fromRect, fromSide);
  const p2 = pointOnRectSide(toRect, toSide);
  const startPt = { x: p1.x, y: p1.y };
  const endPt = { x: p2.x, y: p2.y };
  const svgWaypoints = waypoints;

  const allSvgPoints = [startPt, ...svgWaypoints, endPt];
  const isOrthogonal = connector.lineType === "orthogonal";
  const routingConnector = rotation
    ? { ...connector, waypoints: connector.waypoints?.map((point) => inverseRotateWorkspacePoint(point, rotation)) }
    : connector;
  const routingGeometry = computeConnectorGeometry(
    routingConnector,
    nativeRect(connector.fromBlockId) ?? fromRect,
    nativeRect(connector.toBlockId) ?? toRect,
    blocks,
    IDENTITY_CAMERA,
    0,
    0,
    structuralSides,
    nativeRect,
  );
  const siblingCount = Object.values(blocks).filter((block) => block.parentId === connector.fromBlockId).length;
  const isSharedHierarchyBranch = isOrthogonal && !hasWaypoints && layout.family === "hierarchy" && siblingCount >= 2;
  const nativePathD = isSharedHierarchyBranch
    ? buildSharedTrunkOrthogonalPath(
      { x: routingGeometry.x1, y: routingGeometry.y1 },
      { x: routingGeometry.x2, y: routingGeometry.y2 },
      routingGeometry.fromSide === "top" || routingGeometry.fromSide === "bottom" ? "vertical" : "horizontal",
    )
    : routingGeometry.pathD ?? `M ${routingGeometry.x1} ${routingGeometry.y1} L ${routingGeometry.x2} ${routingGeometry.y2}`;
  const renderedPathD = rotation
    ? reprojectRotatedWorkspacePath(nativePathD, rotation, fromRect, toRect).pathD
    : nativePathD;
  const renderedPathPoints = getPathPoints(renderedPathD, startPt, endPt);
  const orthogonalSegmentPoints = isOrthogonal ? renderedPathPoints : allSvgPoints;
  // Legacy spaces non-orthogonal bend handles by equal arc-length along the
  // rendered path, while keeping one insertion bucket per explicit segment.
  // Using the raw waypoint midpoint here puts a handle at a control point or
  // on the wrong half of a long curve.
  const nonOrthogonalHandlePoints = !isOrthogonal
    ? getPathSegmentMidpoints(renderedPathD, startPt, endPt, Math.max(1, allSvgPoints.length - 1))
    : [];
  const handleWaypointDown = (e: React.PointerEvent, index: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const nextDrag: DragState = {
      type: "waypoint",
      index,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startWaypoints: waypoints.map((p) => ({ ...p })),
    };
    dragRef.current = nextDrag;
    autoPan.reportPointer(e.clientX, e.clientY);
    setDrag(nextDrag);
  };
  const handleSegmentDown = (e: React.PointerEvent, segIdx: number) => {
    if (e.button !== 0 || e.detail > 1) return;
    e.stopPropagation();
    e.preventDefault();
    const pointer = clientToWorkspaceWorld({ x: e.clientX, y: e.clientY });
    const projection = !isOrthogonal
      ? projectConnectorPointToPath(renderedPathD, pointer, Math.max(1, allSvgPoints.length - 1), startPt, endPt)
      : null;
    const insertPoint = projection ?? pointer;
    const resolvedIndex = projection?.insertIndex ?? segIdx;
    const segmentPoints = isOrthogonal ? orthogonalSegmentPoints : allSvgPoints;
    const segmentStart = segmentPoints[resolvedIndex];
    const segmentEnd = segmentPoints[resolvedIndex + 1];
    const segmentDx = Math.abs(segmentEnd.x - segmentStart.x);
    const segmentDy = Math.abs(segmentEnd.y - segmentStart.y);
    const segmentEndpoints = isOrthogonal
      ? { start: { ...segmentStart }, end: { ...segmentEnd } }
      : undefined;
    const segmentAxis = isOrthogonal
      ? (segmentDx >= segmentDy ? "y" : "x")
      : undefined;
    const nextDrag: DragState = {
      type: "segment",
      index: resolvedIndex,
      insertPoint,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startWaypoints: waypoints.map((p) => ({ ...p })),
      orthogonalAxis: isOrthogonal ? (segmentDx >= segmentDy ? "horizontal" : "vertical") : undefined,
      segmentEndpoints,
      segmentPoints: isOrthogonal ? segmentPoints.map((point) => ({ ...point })) : undefined,
      segmentPoint: isOrthogonal
        ? { x: (segmentStart.x + segmentEnd.x) / 2, y: (segmentStart.y + segmentEnd.y) / 2 }
        : undefined,
      segmentAxis,
    };
    dragRef.current = nextDrag;
    autoPan.reportPointer(e.clientX, e.clientY);
    setDrag(nextDrag);
  };
  const removeWaypoint = (index: number) => {
    const next = waypoints.filter((_, idx) => idx !== index);
    updateConnectorWaypoints(selectedConnectorId, next);
  };
  const orthogonalMidpoint = !hasWaypoints && isOrthogonal
    ? getPathMidpoint(renderedPathD, startPt, endPt)
    : null;
  const orthogonalHandlePoints = hasWaypoints
    ? orthogonalSegmentPoints.slice(0, -1).map((point, index) => ({
        point: { x: (point.x + orthogonalSegmentPoints[index + 1].x) / 2, y: (point.y + orthogonalSegmentPoints[index + 1].y) / 2 },
        index,
      }))
    : orthogonalMidpoint
      ? [{ point: orthogonalMidpoint, index: getPathMidpointSegmentIndex(renderedPathD, startPt, endPt) }]
      : [];
  return <ConnectorWaypointHandleOverlays
    connectorId={selectedConnectorId}
    isOrthogonal={isOrthogonal}
    cameraZoom={camera.zoom}
    nonOrthogonalHandlePoints={nonOrthogonalHandlePoints}
    orthogonalHandlePoints={orthogonalHandlePoints}
    waypoints={svgWaypoints}
    onSegmentDown={handleSegmentDown}
    onWaypointDown={handleWaypointDown}
    onRemoveWaypoint={removeWaypoint}
    onClearWaypoints={() => updateConnectorWaypoints(selectedConnectorId, undefined)}
    interactive={interactive}
  />;
}
export default ConnectorWaypointHandles;
