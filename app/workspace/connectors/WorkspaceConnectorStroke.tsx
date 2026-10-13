import React, { useCallback, useEffect, useRef } from "react";
import type { CanvasConnector } from "../types/connector";
import type { AnchorSide } from "../types/connector";
import { buildConnectorPathWithJumps } from "./connectorLineJumps";
import { isPointNearConnectorPath, nextConnectorCycleIndex } from "./connectorHitTesting";
import { getPathAngles, getPathLabelPlacement, getPathPoints, projectPointToPath } from "./connectorPath";
import { getConnectorVisualStyle, lineDashArray } from "./connectorStyle";
import { activateQuickAddButtonAtPoint, endpointDecoration, renderConnectorLabel } from "./ConnectorLayerUi";
import { getWorkspaceArrowDepth, trimConnectorPathForArrow } from "./connectorArrowGeometry";
import { clientToWorkspaceWorld } from "./connectorPointer";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { workspacePerfLog } from "../utils/workspacePerfDebug";

export interface ConnectorStrokeGeometry {
  connector: CanvasConnector;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fromSide: AnchorSide;
  basePathD: string;
}

interface ConnectorStrokeProps extends ConnectorStrokeGeometry {
  selected: boolean;
  selectable: boolean;
  detaching: boolean;
  hitWidth: number;
  allPathInputs: { id: string; d: string }[];
  candidatePaths: readonly { connector: CanvasConnector; basePathD: string }[];
  selectionCycleRef: React.MutableRefObject<{ point: { x: number; y: number } | null; ids: string[]; index: number }>;
}

function WorkspaceConnectorStrokeView({
  connector, x1, y1, x2, y2, basePathD, selected, selectable, detaching, allPathInputs, candidatePaths, selectionCycleRef,
}: ConnectorStrokeProps) {
  const renderStartedAt = typeof performance !== "undefined" ? performance.now() : 0;
  const isDraggingBlock = useWorkspaceStore((state) => state.isDraggingBlock);
  const style = getConnectorVisualStyle(connector);
  const color = connector.strokeColor ?? (selected ? "#2563eb" : "#94a3b8");
  const opacity = detaching ? (style.lineOpacity / 100) * 0.25 : style.lineOpacity / 100;
  const renderPathD = style.lineJump
    ? buildConnectorPathWithJumps(basePathD, connector.id, allPathInputs)
    : basePathD;
  const arrowDepth = getWorkspaceArrowDepth(style.lineWidth);
  const startArrow = style.arrowStart === "arrow" ? trimConnectorPathForArrow(renderPathD, arrowDepth, "start") : null;
  const pathAfterStartArrow = startArrow?.path ?? renderPathD;
  const endArrow = style.arrowEnd === "arrow" ? trimConnectorPathForArrow(pathAfterStartArrow, arrowDepth, "end") : null;
  const visiblePathD = endArrow?.path ?? pathAfterStartArrow;
  const angles = getPathAngles(visiblePathD, { x: x1, y: y1 }, { x: x2, y: y2 });
  const ownPoints = getPathPoints(visiblePathD, { x: x1, y: y1 }, { x: x2, y: y2 });
  const sharedSegmentIndices = isDraggingBlock ? [] : ownPoints.slice(0, -1).flatMap((from, index) => {
    const to = ownPoints[index + 1];
    const ownHorizontal = Math.abs(from.y - to.y) <= 1;
    const ownVertical = Math.abs(from.x - to.x) <= 1;
    const shared = candidatePaths.some((candidate) => {
      if (candidate.connector.id === connector.id) return false;
      const otherPoints = getPathPoints(candidate.basePathD, { x: x1, y: y1 }, { x: x2, y: y2 });
      return otherPoints.slice(0, -1).some((otherFrom, otherIndex) => {
        const otherTo = otherPoints[otherIndex + 1];
        if (ownHorizontal && Math.abs(otherFrom.y - from.y) <= 1 && Math.abs(otherTo.y - from.y) <= 1) {
          return Math.min(to.x, from.x) <= Math.max(otherTo.x, otherFrom.x) - 16
            && Math.max(to.x, from.x) >= Math.min(otherTo.x, otherFrom.x) + 16;
        }
        if (ownVertical && Math.abs(otherFrom.x - from.x) <= 1 && Math.abs(otherTo.x - from.x) <= 1) {
          return Math.min(to.y, from.y) <= Math.max(otherTo.y, otherFrom.y) - 16
            && Math.max(to.y, from.y) >= Math.min(otherTo.y, otherFrom.y) + 16;
        }
        return false;
      });
    });
    return shared ? [index] : [];
  });
  const exclusiveSegmentIndices = ownPoints.length > 1
    ? ownPoints.slice(0, -1).map((_, index) => index).filter((index) => !sharedSegmentIndices.includes(index))
    : [];
  const labelPlacement = getPathLabelPlacement(
    visiblePathD,
    { x: x1, y: y1 },
    { x: x2, y: y2 },
    connector.labelPosition,
    exclusiveSegmentIndices,
  );

  const handleConnectorSelect = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    const point = clientToWorkspaceWorld({ x: e.clientX, y: e.clientY });
    const candidates = candidatePaths
      .filter(({ basePathD: candidatePath }) => isPointNearConnectorPath(candidatePath, point))
      .map(({ connector: candidate }) => candidate.id);
    const ids = candidates.length > 0 ? candidates : [connector.id];
    const index = nextConnectorCycleIndex(ids, selectionCycleRef.current, point);
    selectionCycleRef.current = { point, ids, index };
    useWorkspaceStore.getState().setSelectedConnectorId(ids[index]);
    useWorkspaceStore.getState().setSelection([]);
  };

  const labelDragRef = useRef(false);
  const labelPointerIdRef = useRef<number | null>(null);
  const handleLabelSelect = (e: React.PointerEvent<SVGGElement>) => {
    // A label is its own interaction target. Do not run the connector hit-test
    // here: a label can sit on top of a shared trunk, and cycling nearby paths
    // would select a different connector (whose bend handles then appear).
    e.stopPropagation();
    e.preventDefault();
    useWorkspaceStore.getState().setSelectedConnectorId(connector.id);
    useWorkspaceStore.getState().setSelection([]);
  };
  const updateLabelPosition = useCallback((clientX: number, clientY: number) => {
    if (useWorkspaceStore.getState().isReadOnly) return;
    const point = clientToWorkspaceWorld({ x: clientX, y: clientY });
    const placement = projectPointToPath(visiblePathD, { x: x1, y: y1 }, { x: x2, y: y2 }, point);
    useWorkspaceStore.setState((state) => {
      const existing = state.connectors[connector.id];
      if (!existing) return state;
      // Patch only labelPosition. In particular, never reconstruct the
      // connector from the rendered path: that would discard free waypoints.
      return {
        connectors: {
          ...state.connectors,
          [connector.id]: {
            ...existing,
            waypoints: existing.waypoints,
            labelPosition: placement.fraction,
          },
        },
      };
    });
  }, [connector.id, visiblePathD, x1, y1, x2, y2]);
  // Keep the drag on a page-level pointer stream as well as SVG pointer
  // capture. SVG groups can be replaced during a selection re-render; the
  // window listener makes the label drag survive that replacement and keeps
  // it independent from ConnectorWaypointHandles' segment drag listeners.
  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      if (!labelDragRef.current) return;
      if (labelPointerIdRef.current !== null && e.pointerId !== labelPointerIdRef.current) return;
      e.preventDefault();
      updateLabelPosition(e.clientX, e.clientY);
    };
    const handleWindowPointerUp = (e: PointerEvent) => {
      if (!labelDragRef.current) return;
      if (labelPointerIdRef.current !== null && e.pointerId !== labelPointerIdRef.current) return;
      updateLabelPosition(e.clientX, e.clientY);
      labelDragRef.current = false;
      labelPointerIdRef.current = null;
    };
    window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [connector.id, visiblePathD, updateLabelPosition, x1, y1, x2, y2]);
  const handleLabelPointerDown = (e: React.PointerEvent<SVGGElement>) => {
    handleLabelSelect(e);
    labelDragRef.current = true;
    labelPointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    updateLabelPosition(e.clientX, e.clientY);
  };
  const handleLabelPointerMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!labelDragRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    updateLabelPosition(e.clientX, e.clientY);
  };
  const handleLabelPointerUp = (e: React.PointerEvent<SVGGElement>) => {
    if (!labelDragRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    updateLabelPosition(e.clientX, e.clientY);
    labelDragRef.current = false;
    labelPointerIdRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const renderDuration = typeof performance !== "undefined" ? performance.now() - renderStartedAt : 0;
  if (renderDuration >= 2) {
    workspacePerfLog("connector-stroke-slow", {
      connectorId: connector.id,
      durationMs: Math.round(renderDuration),
      candidatePaths: candidatePaths.length,
      pointCount: ownPoints.length,
      zoomIndependentGeometry: true,
    });
  }

  return (
    <>
      <path data-connector-id={connector.id} d={renderPathD} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" style={{ pointerEvents: selectable ? "all" : "none", cursor: selectable ? "pointer" : "default" }} onPointerDown={selectable ? (e) => { e.stopPropagation(); if (activateQuickAddButtonAtPoint(e.clientX, e.clientY)) return; handleConnectorSelect(e); } : undefined} />
      {selected && <path data-connector-focus-halo={connector.id} d={visiblePathD} fill="none" stroke="#ffffff" strokeWidth={(style.lineWidth || 2) + 7} strokeLinecap="round" opacity={0.96} style={{ pointerEvents: "none" }} />}
      <path data-connector-id={connector.id} d={visiblePathD} fill="none" stroke={color} strokeWidth={style.lineWidth || (selected ? 3 : 2)} strokeDasharray={lineDashArray(style.linePattern)} strokeLinecap={style.linePattern === "dotted" ? "round" : "butt"} opacity={opacity} style={{ pointerEvents: "none" }} />
      {endpointDecoration(style.arrowStart, startArrow?.tip ?? { x: x1, y: y1 }, startArrow?.angle ?? angles.start, true, color, opacity)}
      {endpointDecoration(style.arrowEnd, endArrow?.tip ?? { x: x2, y: y2 }, endArrow?.angle ?? angles.end, false, color, opacity)}
      {renderConnectorLabel(connector, labelPlacement.point, labelPlacement.angle, color, opacity, handleLabelPointerDown, selected, handleLabelPointerMove, handleLabelPointerUp, handleLabelPointerUp)}
    </>
  );
}

function areConnectorStrokePropsEqual(previous: ConnectorStrokeProps, next: ConnectorStrokeProps): boolean {
  // hitWidth is intentionally ignored: the transparent hit path uses a
  // non-scaling SVG stroke, so camera zoom no longer requires this expensive
  // component to recalculate labels, arrows, and shared segments.
  return previous.connector === next.connector
    && previous.x1 === next.x1
    && previous.y1 === next.y1
    && previous.x2 === next.x2
    && previous.y2 === next.y2
    && previous.basePathD === next.basePathD
    && previous.selected === next.selected
    && previous.selectable === next.selectable
    && previous.detaching === next.detaching
    && previous.allPathInputs === next.allPathInputs
    && previous.candidatePaths === next.candidatePaths
    && previous.selectionCycleRef === next.selectionCycleRef;
}

export const WorkspaceConnectorStroke = React.memo(WorkspaceConnectorStrokeView, areConnectorStrokePropsEqual);
