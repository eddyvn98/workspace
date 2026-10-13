"use client";

import React, { useCallback, useMemo, useRef } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { resolveTransform, type BlockId, type CanvasBlock, type Transform } from "../types/block";
import { blockIdsInMap, currentMapLayout, findMapRootId } from "../layout/mapRoot";
import { resolveSwimlaneLaneIds, type SwimlaneBand } from "../layout/swimlaneLayout";
import { computeGeometricSwimlaneBands } from "../layout/swimlaneBands";

const DEFAULT_TRANSFORM = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
const MIN_LANE_THICKNESS = 96;

interface LaneResizeState {
  rootId: BlockId;
  laneId: BlockId;
  orientation: "horizontal" | "vertical";
  startPointer: number;
  startSize: number;
  moved: Array<{ id: BlockId; transform: Transform }>;
}

/**
 * The lane bands behind a swimlane map — the coloured strip, its header cell
 * and the divider between them. Without this a swimlane is just nodes in
 * rows: the bands are what makes "which lane owns this step" readable, and
 * what a reference tool (Larksuite, Visio) draws.
 *
 * The bands are measured from where the blocks currently sit, never from
 * where a layout pass would put them - see computeGeometricSwimlaneBands for
 * why that is the only model that matches the reference tool. It also means a
 * band cannot drift away from its own nodes, and that dragging a step into a
 * neighbouring row is all it takes to move it between lanes.
 */
export function SwimlaneBandLayer() {
  const blocks = useWorkspaceStore((state) => state.blocks);
  const blockOrder = useWorkspaceStore((state) => state.blockOrder);
  const layoutState = useWorkspaceStore((state) => state);
  const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);
  const cameraZoom = useWorkspaceStore((state) => state.camera.zoom);
  const resizeRef = useRef<LaneResizeState | null>(null);

  const onResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, band: SwimlaneBand & { rootId: BlockId; orientation: "horizontal" | "vertical" }) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const state = useWorkspaceStore.getState();
    const lane = state.blocks[band.laneId];
    if (!lane || state.isReadOnly) return;
    const laneTransform = resolveTransform(lane.transform, DEFAULT_TRANSFORM);
    const boundary = band.orientation === "horizontal" ? band.y + band.h : band.x + band.w;
    const moved: LaneResizeState["moved"] = [];

    for (const id of blockIdsInMap(state.blocks, band.rootId)) {
      if (id === band.rootId || id === band.laneId) continue;
      const block = state.blocks[id];
      if (!block) continue;
      const transform = resolveTransform(block.transform, DEFAULT_TRANSFORM);
      const crossCenter = band.orientation === "horizontal"
        ? transform.y + transform.h / 2
        : transform.x + transform.w / 2;
      if (crossCenter >= boundary) moved.push({ id, transform });
    }

    resizeRef.current = {
      rootId: band.rootId,
      laneId: band.laneId,
      orientation: band.orientation,
      startPointer: band.orientation === "horizontal" ? event.clientY : event.clientX,
      startSize: band.orientation === "horizontal" ? laneTransform.h : laneTransform.w,
      moved,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in some browser test environments.
    }
  }, []);

  const onResizePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const active = resizeRef.current;
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();

    const pointer = active.orientation === "horizontal" ? event.clientY : event.clientX;
    const delta = (pointer - active.startPointer) / Math.max(0.01, cameraZoom);
    const nextSize = Math.max(MIN_LANE_THICKNESS, active.startSize + delta);
    const shift = nextSize - active.startSize;
    const lanePatch = active.orientation === "horizontal" ? { h: nextSize } : { w: nextSize };
    updateBlockTransform(active.laneId, lanePatch, "override");

    for (const item of active.moved) {
      updateBlockTransform(item.id, active.orientation === "horizontal"
        ? { y: item.transform.y + shift }
        : { x: item.transform.x + shift }, "override");
    }
  }, [cameraZoom, updateBlockTransform]);

  const finishResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore release errors from synthetic or cancelled pointers.
    }
  }, []);

  const bands = useMemo(() => {
    const out: Array<SwimlaneBand & { rootId: BlockId; orientation: "horizontal" | "vertical"; label: string }> = [];

    // Every independent map on the canvas gets its own bands, so a board
    // holding a swimlane next to a mindmap paints only the swimlane's.
    const rootIds = new Set<BlockId>();
    for (const id of Object.keys(blocks)) {
      const rootId = findMapRootId(blocks, id);
      if (rootId) rootIds.add(rootId);
    }

    for (const rootId of rootIds) {
      const layout = currentMapLayout(layoutState, rootId);
      if (layout.family !== "swimlane") continue;

      const { childrenByParent } = collectMapShape(blocks, blockOrder, rootId);
      const orientation = layout.direction === "down" || layout.direction === "up"
        ? "vertical"
        : "horizontal";
      const laneIds = resolveSwimlaneLaneIds(rootId, childrenByParent);
      const bandRects = computeGeometricSwimlaneBands(blocks, rootId, laneIds, orientation);

      for (const band of bandRects) {
        out.push({ ...band, rootId, orientation, label: laneLabel(blocks[band.laneId]) });
      }
    }

    return out;
  }, [blocks, blockOrder, layoutState]);

  if (bands.length === 0) return null;

  return (
    <>
      {bands.map((band) => (
        <div
          key={`swimlane-band-${band.laneId}`}
          data-workspace-swimlane-band={band.laneId}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${band.x}px`,
            top: `${band.y}px`,
            width: `${band.w}px`,
            height: `${band.h}px`,
            pointerEvents: "none",
            // Reference tools (Lark, Visio) draw the lane grid as a plain
            // gray table, not a per-lane tinted card - the row body itself
            // stays transparent so it reads as one shared table, not stacked
            // colour chips.
            border: `1px solid #cbd5e1`,
            // Behind the blocks, which the canvas wrapper renders above.
            zIndex: 0,
          }}
        >
          {/* Header cell: neutral gray shading over the lane's title slot,
              plus the divider that separates the title from the steps -
              matching a table's header row/column, not a coloured tint. */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: band.orientation === "horizontal" ? `${band.headerExtent - band.x}px` : "100%",
              height: band.orientation === "horizontal" ? "100%" : `${band.headerExtent - band.y}px`,
              background: "#f8fafc",
              borderRight: band.orientation === "horizontal" ? `1px solid #cbd5e1` : undefined,
              borderBottom: band.orientation === "vertical" ? `1px solid #cbd5e1` : undefined,
            }}
          />
        </div>
      ))}
      {bands.slice(0, -1).map((band) => (
        <div
          key={`swimlane-boundary-${band.rootId}-${band.laneId}`}
          data-workspace-swimlane-boundary={`${band.rootId}-${band.laneId}`}
          aria-label="Resize swimlane boundary"
          role="separator"
          onPointerDown={(event) => onResizePointerDown(event, band)}
          onPointerMove={onResizePointerMove}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          style={{
            position: "absolute",
            left: band.orientation === "horizontal" ? `${band.x}px` : `${band.x + band.w - 6}px`,
            top: band.orientation === "horizontal" ? `${band.y + band.h - 6}px` : `${band.y}px`,
            width: band.orientation === "horizontal" ? `${band.w}px` : "12px",
            height: band.orientation === "horizontal" ? "12px" : `${band.h}px`,
            pointerEvents: "auto",
            cursor: band.orientation === "horizontal" ? "row-resize" : "col-resize",
            touchAction: "none",
            zIndex: 2000,
          }}
        />
      ))}
    </>
  );
}

function laneLabel(block: CanvasBlock | undefined): string {
  if (!block) return "";
  const data = block.data as { markdown?: unknown; label?: unknown; title?: unknown } | undefined;
  for (const value of [data?.markdown, data?.label, data?.title]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** The same children/sizes shape computeSwimlaneLayout expects, honouring
 *  collapse the way the reflow pass does. */
function collectMapShape(
  blocks: Record<BlockId, CanvasBlock>,
  blockOrder: BlockId[],
  rootId: BlockId,
) {
  const childrenByParent = new Map<BlockId, BlockId[]>();
  const sizes = new Map<BlockId, { w: number; h: number }>();

  const isVisible = (blockId: BlockId): boolean => {
    let currentId: BlockId | undefined = blockId;
    for (let guard = 0; currentId && guard < 1000; guard += 1) {
      const current: CanvasBlock | undefined = blocks[currentId];
      if (!current) return false;
      if (!current.parentId) return true;
      if (blocks[current.parentId]?.isCollapsed) return false;
      currentId = current.parentId;
    }
    return false;
  };

  const ordered = [
    ...blockOrder.map((id) => blocks[id]).filter(Boolean),
    ...Object.values(blocks).filter((block) => !blockOrder.includes(block.id)),
  ];

  for (const block of ordered) {
    const resolved = resolveTransform(block.transform, DEFAULT_TRANSFORM);
    sizes.set(block.id, { w: resolved.w, h: resolved.h });
    if (block.parentId && isVisible(block.id)) {
      const siblings = childrenByParent.get(block.parentId) ?? [];
      siblings.push(block.id);
      childrenByParent.set(block.parentId, siblings);
    }
  }

  void rootId;
  return { childrenByParent, sizes };
}

export default SwimlaneBandLayer;
