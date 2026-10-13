"use client";

import React from "react";
import { useCameraControls } from "../hooks/useCameraControls";
import { useRubberBandSelect } from "../hooks/useRubberBandSelect";
import { useFreehandDraw } from "../hooks/useFreehandDraw";
import { useWorkspacePathCad } from "../hooks/useWorkspacePathCad";
import { useShapeDrawToSize } from "../hooks/useShapeDrawToSize";
import { useSnapGuides } from "../hooks/useSnapGuides";
import { useDragMergePreview } from "../hooks/useDragMergePreview";
import { useGridSnapToggle } from "../hooks/useGridSnapToggle";
import { useImageDropFromOS } from "../hooks/useImageDropFromOS";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useFreehandConfig } from "../utils/freehandPresets";
import { findSwimlaneCellAt, isSwimlaneAnchorTable } from "../utils/swimlaneTableAnchors";
import { SelectionRectangle } from "./SelectionRectangle";
import { PathCadPreview } from "./PathCadPreview";
import { SwimlaneBandLayer } from "./SwimlaneBandLayer";
import { ConnectorLayer } from "../connectors/ConnectorLayer";
import { ConnectorEndpointHandles } from "../connectors/ConnectorEndpointHandles";

/** Must match GRID_SIZE in hooks/useBlockDrag.ts so the visible dots line up
 *  with where blocks actually snap. */
const GRID_SIZE = 20;

export interface WorkspaceCanvasProps {
  children?: React.ReactNode;
  /** The store keeps the complete board, while the canvas can mount its
   *  visual nodes progressively during a large-board switch. */
  visibleBlockIds?: ReadonlySet<string>;
  /** Defer the expensive connector routing pass until all visual nodes exist. */
  renderConnectors?: boolean;
  /** Table blocks (the swimlane grid): rendered below the connector SVG so a
   *  wire that must cross a header row/column (e.g. a quick-add "create"
   *  shape placed above the header) stays visible on top of the cell fill,
   *  instead of the table's own paint hiding it - matching Lark, where the
   *  grid is a background layer and arrows always draw over it. */
  backgroundChildren?: React.ReactNode;
  onBackgroundPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function WorkspaceCanvas({ children, backgroundChildren, visibleBlockIds, renderConnectors = true, onBackgroundPointerDown }: WorkspaceCanvasProps) {
  const {
    camera,
    canvasRef,
    onPointerDown: onCameraPointerDown,
    onPointerMove: onCameraPointerMove,
    onPointerUp: onCameraPointerUp,
    onTouchStart: onCameraTouchStart,
    onTouchMove: onCameraTouchMove,
    onTouchEnd: onCameraTouchEnd,
  } = useCameraControls();

  const {
    selectionRect,
    onPointerDown: onSelectPointerDown,
    onPointerMove: onSelectPointerMove,
    onPointerUp: onSelectPointerUp,
  } = useRubberBandSelect();

  const {
    drawPoints,
    snapPoint,
    onPointerDown: onDrawPointerDown,
    onPointerMove: onDrawPointerMove,
    onPointerUp: onDrawPointerUp,
    onDoubleClick: onDrawDoubleClick,
  } = useFreehandDraw();

  const {
    previewRect: shapePreviewRect,
    onPointerDown: onShapePointerDown,
    onPointerMove: onShapePointerMove,
    onPointerUp: onShapePointerUp,
  } = useShapeDrawToSize();

  const snapGuides = useSnapGuides();
  const dragMergePreview = useDragMergePreview();
  const { isGridSnapEnabled } = useGridSnapToggle();
  const { onDragOver, onDrop } = useImageDropFromOS();
  const pathCad = useWorkspacePathCad();
  const strokeColor = useFreehandConfig((state) => state.strokeColor);
  const strokeWidth = useFreehandConfig((state) => state.strokeWidth);
  const activeFreehandTool = useWorkspaceStore((state) => state.activeFreehandTool);
  const hasConnectorFocus = useWorkspaceStore((state) => Boolean(state.selectedConnectorId && state.connectors[state.selectedConnectorId]));
  const isHighlighter = activeFreehandTool === "highlighter";
  const previewStrokeWidth = isHighlighter ? Math.max(strokeWidth * 4, 12) : strokeWidth;
  const previewOpacity = isHighlighter ? 0.4 : 1;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pathCad.handlePointerDown(e)) return;
    onBackgroundPointerDown?.(e);
    onDrawPointerDown(e);
    onShapePointerDown(e);
    onCameraPointerDown(e);
    onSelectPointerDown(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pathCad.handlePointerMove(e)) return;
    onCameraPointerMove(e);
    onDrawPointerMove(e);
    onShapePointerMove(e);
    onSelectPointerMove(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    onCameraPointerUp(e);
    onDrawPointerUp(e);
    onShapePointerUp(e);
    onSelectPointerUp(e);
  };

  // A double-click that fell through a swimlane body cell's empty area (see
  // findSwimlaneCellAt's doc comment) lands here on the canvas background -
  // redirect it into that cell's text edit mode instead of the freehand
  // tool's "finalize polyline" double-click.
  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const cellTarget = findSwimlaneCellAt(e.clientX, e.clientY);
    const table = cellTarget ? useWorkspaceStore.getState().blocks[cellTarget.tableId] : undefined;
    if (cellTarget && isSwimlaneAnchorTable(table)) {
      useWorkspaceStore.getState().setSelection([cellTarget.tableId]);
      useWorkspaceStore.getState().setPendingEditTableCell(cellTarget);
      return;
    }
    onDrawDoubleClick();
  };

  const cameraTransform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;

  return (
    <div
      data-workspace-canvas="true"
      className="absolute inset-y-0 left-0 right-0 h-full w-full overflow-hidden select-none touch-none sm:w-auto sm:right-[calc(var(--workspace-chat-width,0px)+var(--workspace-comments-width,0px))]"
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onTouchStart={onCameraTouchStart}
      onTouchMove={onCameraTouchMove}
      onTouchEnd={onCameraTouchEnd}
      onDoubleClick={handleDoubleClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isGridSnapEnabled && (
        <div
          className="absolute inset-0"
          style={{
            pointerEvents: "none",
            backgroundImage: "radial-gradient(circle, #94a3b8 1px, transparent 1px)",
            backgroundSize: `${GRID_SIZE * camera.zoom}px ${GRID_SIZE * camera.zoom}px`,
            backgroundPosition: `${camera.x}px ${camera.y}px`,
            opacity: 0.4,
          }}
        />
      )}
      {backgroundChildren && (
        <div
          className="absolute top-0 left-0"
          style={{
            // Same z-index as the connector layer below (not negative - a
            // negative z-index here would escape past this container's own
            // position:relative ancestor and paint behind the page's own
            // background, vanishing entirely). Ties at the same z-index
            // resolve by DOM order, and this div comes first in the JSX, so
            // it still paints under ConnectorLayer.
            zIndex: 0,
            pointerEvents: "none",
            transform: cameraTransform,
            transformOrigin: "0 0",
          }}
        >
          {backgroundChildren}
        </div>
      )}
      {/* The connector SVG shares the blocks' camera transform, byte for byte,
          so the browser scales wires and nodes together in one composited
          step. Anything that reads screen pixels to place a wire is a frame
          behind whatever transform React is about to commit, which is what
          used to make connectors trail the nodes during a wheel zoom. */}
      {renderConnectors && <div
        className="absolute inset-0"
        style={{
          zIndex: 0,
          pointerEvents: "none",
          overflow: "visible",
          transform: cameraTransform,
          transformOrigin: "0 0",
        }}
      >
        <ConnectorLayer visibleBlockIds={visibleBlockIds} />
      </div>}
      {renderConnectors && hasConnectorFocus && (
        <div
          aria-hidden="true"
          data-workspace-connector-focus-dimmer="true"
          className="pointer-events-none absolute inset-0"
          style={{ zIndex: 1, backgroundColor: "rgba(15, 23, 42, 0.16)", transition: "opacity 160ms ease" }}
        />
      )}
      <div
        className="absolute top-0 left-0"
        style={{
          // Keep block frames above the connector SVG so controls at a node's
          // edge (collapse, resize, quick-add) cannot be intercepted by a
          // wide connector hit path. The wrapper itself stays transparent to
          // pointer hit-testing, so blank-canvas gestures still reach here.
          zIndex: hasConnectorFocus ? 2 : 1,
          pointerEvents: "none",
          transform: cameraTransform,
          transformOrigin: "0 0",
        }}
      >
        <SwimlaneBandLayer />
        {children}
        <PathCadPreview />
        {dragMergePreview && (
          <div
            data-workspace-merge-preview="true"
            className="absolute rounded-md border-2 border-dashed border-blue-500 bg-blue-500/10"
            style={{
              left: `${dragMergePreview.x}px`,
              top: `${dragMergePreview.y}px`,
              width: `${dragMergePreview.w}px`,
              height: `${dragMergePreview.h}px`,
            }}
          />
        )}
      </div>
      {renderConnectors && hasConnectorFocus && (
        <div
          className="absolute inset-0"
          data-workspace-connector-focus-overlay="true"
          // Keep the selected label above bend handles: a label drag must not
          // accidentally create a waypoint when both affordances share the
          // same midpoint.
          style={{ zIndex: 5, pointerEvents: "none", overflow: "visible", transform: cameraTransform, transformOrigin: "0 0" }}
        >
          <ConnectorLayer selectionOverlay visibleBlockIds={visibleBlockIds} />
        </div>
      )}
      {renderConnectors && hasConnectorFocus && (
        <div
          aria-hidden="true"
          data-workspace-connector-handle-overlay="true"
          className="pointer-events-none absolute inset-0"
          style={{ zIndex: 6, pointerEvents: "none", overflow: "visible", transform: cameraTransform, transformOrigin: "0 0" }}
        >
          <ConnectorLayer handleOverlay visibleBlockIds={visibleBlockIds} />
        </div>
      )}
      {/* Endpoint handles must sit above BlockFrame: the anchor is on the node
          edge, so a z-index-0 connector SVG cannot receive its pointerdown
          through the z-index-1 block surface. Keep the same camera transform
          and let only the handle circles opt into pointer events. */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 4,
          pointerEvents: "none",
          overflow: "visible",
          transform: cameraTransform,
          transformOrigin: "0 0",
        }}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          style={{ pointerEvents: "none" }}
        >
          <ConnectorEndpointHandles />
        </svg>
      </div>
      <SelectionRectangle rect={selectionRect} />
      {shapePreviewRect && (shapePreviewRect.w > 0 || shapePreviewRect.h > 0) && (
        <div
          className="fixed pointer-events-none z-50 border-2 border-dashed border-blue-500 bg-blue-500/10"
          style={{
            left: `${shapePreviewRect.x}px`,
            top: `${shapePreviewRect.y}px`,
            width: `${shapePreviewRect.w}px`,
            height: `${shapePreviewRect.h}px`,
          }}
        />
      )}
      {snapGuides.map((guide, idx) => (
        <div
          key={`${guide.type}-${guide.position}-${idx}`}
          className="fixed pointer-events-none z-50"
          style={
            guide.type === "vertical"
              ? {
                  position: "fixed",
                  top: 0,
                  bottom: 0,
                  left: `${guide.position}px`,
                  width: "1px",
                  height: "100%",
                  borderLeft: "1px dashed #2563eb",
                  pointerEvents: "none",
                  zIndex: 50,
                }
              : {
                  position: "fixed",
                  top: `${guide.position}px`,
                  left: 0,
                  right: 0,
                  width: "100%",
                  height: "1px",
                  borderTop: "1px dashed #2563eb",
                  pointerEvents: "none",
                  zIndex: 50,
                }
          }
        />
      ))}
      {drawPoints && drawPoints.length > 0 && (
        <svg
          className="fixed inset-0 pointer-events-none z-50 h-full w-full"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          <polyline
            points={drawPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke={strokeColor}
            strokeWidth={previewStrokeWidth}
            strokeOpacity={previewOpacity}
            opacity={previewOpacity}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {snapPoint && (
            <circle
              cx={snapPoint.x}
              cy={snapPoint.y}
              r={6}
              fill="none"
              stroke="#2563eb"
              strokeWidth={2}
            />
          )}
        </svg>
      )}
    </div>
  );
}
