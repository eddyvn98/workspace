import React from "react";
import { screenUnits } from "./connectorPointer";

type Point = { x: number; y: number };

interface Props {
  connectorId: string;
  isOrthogonal: boolean;
  cameraZoom: number;
  nonOrthogonalHandlePoints: Point[];
  orthogonalHandlePoints: Array<{ point: Point; index: number }>;
  waypoints: Point[];
  onSegmentDown: (event: React.PointerEvent, index: number) => void;
  onWaypointDown: (event: React.PointerEvent, index: number) => void;
  onRemoveWaypoint: (index: number) => void;
  onClearWaypoints: () => void;
  interactive?: boolean;
}

export function ConnectorWaypointHandleOverlays({
  connectorId,
  isOrthogonal,
  cameraZoom,
  nonOrthogonalHandlePoints,
  orthogonalHandlePoints,
  waypoints,
  onSegmentDown,
  onWaypointDown,
  onRemoveWaypoint,
  onClearWaypoints,
  interactive = true,
}: Props) {
  const isLabelTarget = (event: React.PointerEvent) => {
    const target = event.target as Element | null;
    return Boolean(target?.closest?.("[data-connector-label-group], [data-connector-label]"));
  };
  return (
    <g data-selected-connector-id={connectorId} className="select-none">
      {!isOrthogonal && nonOrthogonalHandlePoints.map((point, segIdx) => (
        <g key={`seg-${connectorId}-${segIdx}`} role={interactive ? "button" : undefined} aria-label={interactive ? "Add connector bend" : undefined} style={{ pointerEvents: interactive ? "auto" : "none", cursor: interactive ? "crosshair" : "default" }} onPointerDown={interactive ? (event) => { if (isLabelTarget(event)) return; onSegmentDown(event, segIdx); } : undefined}>
          <circle cx={point.x} cy={point.y} r={screenUnits(11, cameraZoom)} fill="transparent" />
          <circle cx={point.x} cy={point.y} r={screenUnits(5, cameraZoom)} fill="#f97316" stroke="#ffffff" strokeWidth={screenUnits(2, cameraZoom)} style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }} />
          <title>Click or drag to add bend point</title>
        </g>
      ))}

      {isOrthogonal && orthogonalHandlePoints.map(({ point, index }) => (
        <g key={`orthogonal-handle-${connectorId}-${index}`} role={interactive ? "button" : undefined} aria-label={interactive ? "Drag orthogonal segment" : undefined} style={{ pointerEvents: interactive ? "auto" : "none", cursor: interactive ? "move" : "default" }} onPointerDown={interactive ? (event) => { if (isLabelTarget(event)) return; onSegmentDown(event, index); } : undefined} onDoubleClick={interactive ? (event) => { event.stopPropagation(); if (waypoints.length > 0) onClearWaypoints(); } : undefined}>
          <circle cx={point.x} cy={point.y} r={screenUnits(11, cameraZoom)} fill="transparent" />
          <circle cx={point.x} cy={point.y} r={screenUnits(5, cameraZoom)} fill="#f97316" stroke="#ffffff" strokeWidth={screenUnits(2, cameraZoom)} />
        </g>
      ))}

      {!isOrthogonal && waypoints.map((point, index) => (
        <g key={`wp-handle-${connectorId}-${index}`} style={{ pointerEvents: interactive ? "auto" : "none", cursor: interactive ? "move" : "default" }} onPointerDown={interactive ? (event) => { if (isLabelTarget(event)) return; onWaypointDown(event, index); } : undefined} onContextMenu={interactive ? (event) => { event.preventDefault(); event.stopPropagation(); onRemoveWaypoint(index); } : undefined} onDoubleClick={interactive ? (event) => { event.stopPropagation(); onRemoveWaypoint(index); } : undefined}>
          {interactive && <title>Drag to move · Right-click or double-click to remove</title>}
          <circle cx={point.x} cy={point.y} r={screenUnits(12, cameraZoom)} fill="transparent" style={{ pointerEvents: "all" }} />
          <circle cx={point.x} cy={point.y} r={screenUnits(5, cameraZoom)} fill="#f97316" stroke="#ffffff" strokeWidth={screenUnits(2, cameraZoom)} style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }} />
        </g>
      ))}
    </g>
  );
}
