"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { FreehandToolType, Position } from "../types/block";
import {
  moveFreehandPoints,
  resizeFreehandCircle,
  resizeFreehandSquare,
} from "../utils/freehandResize";

interface Props {
  points: Position[];
  tool?: FreehandToolType;
  onChange: (points: Position[]) => void;
}

interface DragState {
  handle: Handle;
  startX: number;
  startY: number;
  points: Position[];
}

type Handle =
  | { kind: "point"; index: number }
  | { kind: "square-corner"; index: number }
  | { kind: "circle-center" }
  | { kind: "circle-radius"; axis: "x" | "y" };

function bounds(points: Position[]) {
  return points.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      minY: Math.min(result.minY, point.y),
      maxX: Math.max(result.maxX, point.x),
      maxY: Math.max(result.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
}

export function PathVertexHandles({ points, tool, onChange }: Props) {
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const zoom = useWorkspaceStore((state) => state.camera.zoom || 1);
  const [drag, setDrag] = useState<DragState | null>(null);
  const handles = useMemo<Handle[]>(() => {
    if (points.length <= 1) return points.map((_, index) => ({ kind: "point", index }));
    if (tool === "square" && points.length >= 4) {
      return points.slice(0, 4).map((_, index) => ({ kind: "square-corner", index }));
    }
    if (tool === "circle" && points.length >= 4) {
      return [
        { kind: "circle-center" },
        { kind: "circle-radius", axis: "x" },
        { kind: "circle-radius", axis: "y" },
      ];
    }
    return [{ kind: "point", index: 0 }, { kind: "point", index: points.length - 1 }];
  }, [points, tool]);

  useEffect(() => {
    if (!drag) return;
    const onPointerMove = (event: PointerEvent) => {
      const dx = (event.clientX - drag.startX) / zoom;
      const dy = (event.clientY - drag.startY) / zoom;
      const { handle } = drag;
      const lockAspect = event.ctrlKey || event.metaKey;
      if (handle.kind === "circle-center") onChange(moveFreehandPoints(drag.points, dx, dy));
      else if (handle.kind === "circle-radius") {
        const radiusDelta = handle.axis === "x" ? dx : -dy;
        onChange(resizeFreehandCircle(drag.points, handle.axis, radiusDelta, lockAspect));
      }
      else if (handle.kind === "square-corner") onChange(resizeFreehandSquare(drag.points, handle.index, dx, dy, lockAspect));
      else onChange(drag.points.map((point, index) => index === handle.index ? { x: point.x + dx, y: point.y + dy } : point));
    };
    const onPointerUp = () => setDrag(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [drag, onChange, zoom]);

  if (isReadOnly || points.length === 0) return null;

  return (
    <g data-path-vertex-handles="true" data-export-exclude="true">
      {handles.map((handle, handleIndex) => {
        const box = bounds(points);
        const point = handle.kind === "circle-center"
          ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
          : handle.kind === "circle-radius" && handle.axis === "x"
            ? { x: box.maxX, y: (box.minY + box.maxY) / 2 }
            : handle.kind === "circle-radius"
              ? { x: (box.minX + box.maxX) / 2, y: box.minY }
              : points[handle.index];
        if (!point) return null;
        return (
          <g
            key={`path-vertex-${handleIndex}`}
            role="button"
            aria-label={tool === "square" || tool === "circle" ? "Move freehand vertex" : "Move freehand endpoint"}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              setDrag({
                handle,
                startX: event.clientX,
                startY: event.clientY,
                points: points.map((current) => ({ ...current })),
              });
            }}
            style={{ pointerEvents: "auto", cursor: "move" }}
          >
            <circle cx={point.x} cy={point.y} r={11} fill="transparent" />
            <circle
              cx={point.x}
              cy={point.y}
              r={6}
              fill="#ffffff"
              stroke={handle.kind === "circle-center" ? "#2563eb" : "#2563eb"}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }}
            />
            <title>Drag to reshape freehand path</title>
          </g>
        );
      })}
    </g>
  );
}

export default PathVertexHandles;
