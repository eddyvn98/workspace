"use client";

import React, { useEffect, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { pickFacingSide, pointOnRectSide } from "./anchorRegistry";
import { blockWorldRect } from "./blockWorldRect";
import { clientToWorkspaceWorld, resolveConnectorDropTarget, resolveExplicitConnectorDropTarget, screenUnits } from "./connectorPointer";
import { buildConnectorPathParity } from "./connectorPathParity";
import { useWorkspaceDragAutoPan } from "../hooks/useWorkspaceDragAutoPan";
import { imageFlowConnectionError } from "./imageFlowConnection";
import { isImageFlowBlock } from "../types/imageFlow";
import { toast } from "sonner";

type Endpoint = "from" | "to";
type Point = { x: number; y: number };

interface DragState {
  end: Endpoint;
  movingBlockId: string;
  fixedBlockId: string;
  fixedPoint: Point;
  currentPoint: Point;
}

/** The drop point has to be compared against a canvas-space rect, so the
 *  pointer is converted before the facing side is picked. */
function dropPointRect(event: PointerEvent): DOMRect {
  const point = clientToWorkspaceWorld({ x: event.clientX, y: event.clientY });
  return new DOMRect(point.x, point.y, 0, 0);
}

function updateConnectorEndpoint(id: string, end: Endpoint, blockId: string, side: "top" | "right" | "bottom" | "left" | "center") {
	const current = useWorkspaceStore.getState();
	const existing = current.connectors[id];
	if (!existing) return false;
	const patch = end === "from"
		? { fromBlockId: blockId, fromSide: side }
		: { toBlockId: blockId, toSide: side };
	const updated = { ...existing, ...patch, waypoints: undefined };
	const error = imageFlowConnectionError(current.blocks, current.connectors, updated);
	if (error) {
		toast.error(error);
		return false;
	}
	useWorkspaceStore.setState((state) => {
		if (state.isReadOnly) return state;
		const latest = state.connectors[id];
		if (!latest) return state;
		const target = state.blocks[updated.toBlockId];
		const source = state.blocks[updated.fromBlockId];
		const blocks = isImageFlowBlock(target) && target.data.stepKind === "advanced" && target.data.advancedLevel !== "mode" && isImageFlowBlock(source)
			? { ...state.blocks, [target.id]: { ...target, data: { ...target.data, parentBlockId: source.id }, updatedAt: Date.now() } }
			: state.blocks;
		return {
			blocks,
			connectors: {
				...state.connectors,
				[id]: updated,
			},
		};
	});
	return true;
}

function snapEndpointPoint(blocks: Parameters<typeof resolveConnectorDropTarget>[0], drag: DragState, point: Point, clientPoint?: Point) {
  // Reconnecting may deliberately pick the endpoint's current block again to
  // change only its anchor side. Exclude the fixed opposite endpoint instead;
  // the final guard below still prevents creating a self-connection.
  const target = (clientPoint && resolveExplicitConnectorDropTarget(blocks, drag.fixedBlockId, clientPoint))
    ?? resolveConnectorDropTarget(blocks, drag.fixedBlockId, point);
  if (!target || target.blockId === drag.fixedBlockId) return { point, target: null };
  return { point: target.point, target };
}

export function ConnectorEndpointHandles() {
  const selectedConnectorId = useWorkspaceStore((state) => state.selectedConnectorId);
  const connectors = useWorkspaceStore((state) => state.connectors);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const zoom = useWorkspaceStore((state) => state.camera.zoom);
  const [drag, setDrag] = useState<DragState | null>(null);
  const pointerRef = React.useRef({ clientX: 0, clientY: 0 });
  const autoPan = useWorkspaceDragAutoPan(() => {
    const { clientX, clientY } = pointerRef.current;
    setDrag((current) => {
      if (!current) return null;
      const next = snapEndpointPoint(
        useWorkspaceStore.getState().blocks,
        current,
        clientToWorkspaceWorld({ x: clientX, y: clientY }),
        { x: clientX, y: clientY },
      );
      return { ...current, currentPoint: next.point };
    });
  });
  useEffect(() => () => autoPan.stop(), [autoPan]);

  const connector = selectedConnectorId ? connectors[selectedConnectorId] : null;
  const fromRect = connector ? blockWorldRect(blocks, connector.fromBlockId) : null;
  const toRect = connector ? blockWorldRect(blocks, connector.toBlockId) : null;

  useEffect(() => {
    if (!drag || !selectedConnectorId) return;
    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      autoPan.reportPointer(event.clientX, event.clientY);
      const point = clientToWorkspaceWorld({ x: event.clientX, y: event.clientY });
      setDrag((current) => {
        if (!current) return null;
        const snapped = snapEndpointPoint(blocks, current, point, { x: event.clientX, y: event.clientY });
        return {
          ...current,
          currentPoint: snapped.point,
        };
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      const dropPoint = clientToWorkspaceWorld({ x: event.clientX, y: event.clientY });
      const explicit = resolveExplicitConnectorDropTarget(blocks, drag.fixedBlockId, { x: event.clientX, y: event.clientY });
      const snapped = explicit
        ? { point: explicit.point, target: explicit }
        : snapEndpointPoint(blocks, drag, dropPoint);
      const targetId = snapped.target?.blockId ?? null;
      const targetRect = targetId ? blockWorldRect(blocks, targetId) : null;
      if (targetId && targetId !== drag.fixedBlockId && targetRect) {
        updateConnectorEndpoint(
          selectedConnectorId,
          drag.end,
          targetId,
          snapped.target?.side ?? pickFacingSide(targetRect, dropPointRect(event)),
        );
      }
      autoPan.stop();
      setDrag(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [autoPan, blocks, drag, selectedConnectorId]);

  if (!connector || !fromRect || !toRect || !selectedConnectorId || isReadOnly) return null;
  const fromSide = connector.fromSide ?? pickFacingSide(fromRect, toRect);
  const toSide = connector.toSide ?? pickFacingSide(toRect, fromRect);
  const fromPoint = pointOnRectSide(fromRect, fromSide);
  const toPoint = pointOnRectSide(toRect, toSide);
  const endpoints: Array<{ end: Endpoint; point: Point; fixedBlockId: string; fixedPoint: Point }> = [
    { end: "from", point: fromPoint, fixedBlockId: connector.toBlockId, fixedPoint: toPoint },
    { end: "to", point: toPoint, fixedBlockId: connector.fromBlockId, fixedPoint: fromPoint },
  ];

  return (
    <g data-connector-endpoint-handles={selectedConnectorId} className="select-none">
      {drag && (() => {
        const start = drag.end === "from" ? drag.currentPoint : drag.fixedPoint;
        const end = drag.end === "from" ? drag.fixedPoint : drag.currentPoint;
        const previewD = buildConnectorPathParity(start, end, connector.lineType ?? "straight");
        return (
          <path
            data-connector-preview="true"
            d={previewD}
            fill="none"
            stroke="#2563eb"
            strokeWidth={screenUnits(2, zoom)}
            strokeDasharray={`${screenUnits(6, zoom)} ${screenUnits(4, zoom)}`}
            pointerEvents="none"
          />
        );
      })()}
      {endpoints.map(({ end, point, fixedBlockId, fixedPoint }) => (
        <g
          key={`${selectedConnectorId}-${end}`}
          role="button"
          aria-label={`Reconnect connector ${end === "from" ? "start" : "end"}`}
          style={{ pointerEvents: "auto", cursor: "crosshair" }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            setDrag({
              end,
              movingBlockId: end === "from" ? connector.fromBlockId : connector.toBlockId,
              fixedBlockId,
              fixedPoint,
              currentPoint: point,
            });
            pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
            autoPan.reportPointer(event.clientX, event.clientY);
          }}
        >
          <circle cx={point.x} cy={point.y} r={screenUnits(11, zoom)} fill="transparent" />
          <circle
            cx={point.x}
            cy={point.y}
            r={screenUnits(5, zoom)}
            fill="#2563eb"
            stroke="#ffffff"
            strokeWidth={screenUnits(2, zoom)}
            style={{ pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}
          />
          <title>Drag to reconnect {end === "from" ? "start" : "end"} anchor</title>
        </g>
      ))}
    </g>
  );
}

export default ConnectorEndpointHandles;
