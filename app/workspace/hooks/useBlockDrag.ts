"use client";

import { useCallback, useEffect, useRef } from "react";
import type React from "react";
import { resolveTransform, type BlockId, type Transform } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { setActiveSnapGuides } from "./useSnapGuides";
import { computeSingleBlockSnap, runSnapBackAnimation } from "../layout/blockDragMath";
import {
  clearReparentPreview,
  getReparentRoots,
  type ReparentPreviewState,
  updateReparentPreview,
} from "../layout/reparentPreview";
import { commitWorkspaceReparent, detachDraggedRoots } from "./blockDragReparent";
import { useWorkspaceDragAutoPan } from "./useWorkspaceDragAutoPan";
import { setDetachingRootIds } from "./useDragConnectorPreview";
import { setDragMergePreview } from "./useDragMergePreview";
import { setWorkspaceBlockDragging } from "./useWorkspaceDragStatus";
import { computeMergePreviewBox } from "../layout/blockDragMergePreview";
import {
  DEFAULT_DRAG_TRANSFORM,
  DETACH_BUFFER,
  DRAG_ACTIVATION_THRESHOLD,
  type DragState,
} from "./blockDragTypes";
import { createBlockDragState, isFrameContainerDrag, isFlowchartDrag, isStandaloneContentDrag } from "./blockDragStart";
import { commitFrameDrop } from "./blockDragFrames";

export function useBlockDrag(blockId: BlockId, initialTransform?: Transform) {
  const block = useWorkspaceStore((state) => state.blocks[blockId]);
  const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const removeConnector = useWorkspaceStore((state) => state.removeConnector);
  const setDraggedBlockIds = useWorkspaceStore((state) => state.setDraggedBlockIds);
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);

  const dragStateRef = useRef<DragState | null>(null);
  const snapBackRafRef = useRef<number | null>(null);
  const applyDragFrameRef = useRef<((clientX: number, clientY: number) => void) | null>(null);
  const moveRafRef = useRef<number | null>(null);
  const dragAutoPan = useWorkspaceDragAutoPan((dx, dy) => {
    const state = dragStateRef.current;
    if (!state) return;
    // Camera pan uses screen pixels; shift the pointer origin before converting to canvas units.
    state.startX += dx;
    state.startY += dy;
    applyDragFrameRef.current?.(state.lastClientX, state.lastClientY);
  });
  const reparentPreviewRef = useRef<ReparentPreviewState>({
    targetId: null,
    placement: "child",
    ghost: null,
    targetElement: null,
    outline: "",
    boxShadow: "",
  });
  const clearCurrentReparentPreview = useCallback(() => {
    clearReparentPreview(reparentPreviewRef.current);
  }, []);
  useEffect(() => {
    return () => {
      if (snapBackRafRef.current !== null) {
        cancelAnimationFrame(snapBackRafRef.current);
      }
      if (moveRafRef.current !== null) {
        cancelAnimationFrame(moveRafRef.current);
        moveRafRef.current = null;
      }
      if (dragStateRef.current?.hasActivated) {
        useWorkspaceStore.getState().setIsDraggingBlock(false);
        useWorkspaceStore.getState().setDraggedBlockIds([]);
      }
      clearCurrentReparentPreview();
      setDetachingRootIds(new Set());
      setDragMergePreview(null);
      dragAutoPan.stop();
    };
  }, [clearCurrentReparentPreview, dragAutoPan]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // The freehand eraser handles path hits at the canvas level. Let its
      // pointerdown bubble instead of capturing it as a block drag.
      if (useWorkspaceStore.getState().activeFreehandTool === "eraser") {
        setWorkspaceBlockDragging(false);
        return;
      }
      if (e.button !== 0) return;
      if (block?.style?.isLocked || useWorkspaceStore.getState().isReadOnly) return;
      if (snapBackRafRef.current !== null) {
        cancelAnimationFrame(snapBackRafRef.current);
        snapBackRafRef.current = null;
      }

      dragStateRef.current = createBlockDragState(blockId, initialTransform, e, selectedBlockIds);

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture can fail if pointer is inactive
      }

      e.stopPropagation();
    },
    [block, blockId, initialTransform, selectedBlockIds]
  );

  const applyDragFrame = useCallback(
    (clientX: number, clientY: number) => {
      const state = dragStateRef.current;
      if (!state || !state.isDragging || !state.hasActivated) return;

      const zoom = useWorkspaceStore.getState().camera.zoom || 1;
      const deltaX = (clientX - state.startX) / zoom;
      const deltaY = (clientY - state.startY) / zoom;

      if (state.trackedBlocks.length === 1) {
        const tracked = state.trackedBlocks[0];
        const candidateX = tracked.initialX + deltaX;
        const candidateY = tracked.initialY + deltaY;

        const allBlocks = useWorkspaceStore.getState().blocks;
        const currentBlock = allBlocks[tracked.id] ?? block;
        const currentTransform = currentBlock
          ? resolveTransform(currentBlock.transform, DEFAULT_DRAG_TRANSFORM)
          : DEFAULT_DRAG_TRANSFORM;

        const snapped = computeSingleBlockSnap(
          candidateX, candidateY, currentTransform, tracked.id, allBlocks, useWorkspaceStore.getState().camera,
        );
        setActiveSnapGuides(snapped.guides);
        updateBlockTransform(tracked.id, { x: snapped.x, y: snapped.y }, "override");
      } else {
        for (const tracked of state.trackedBlocks) {
          updateBlockTransform(
            tracked.id,
            { x: tracked.initialX + deltaX, y: tracked.initialY + deltaY },
            "override"
          );
        }
      }

      const targetId = isFlowchartDrag(state.trackedBlocks[0].id) || isStandaloneContentDrag(state.trackedBlocks[0].id)
        ? null
        : updateReparentPreview(
          reparentPreviewRef.current,
          useWorkspaceStore.getState().blocks,
          state.trackedBlocks.map((tracked) => tracked.id),
          clientX,
          clientY,
        );

      // Live "would-be landing spot" ghost for a single-block merge — see
      // useDragMergePreview's own doc comment for why this only covers drop
      // onto a node ("child" placement), not a before/after reorder.
      if (targetId && state.trackedBlocks.length === 1) {
        const box = computeMergePreviewBox(
          targetId,
          reparentPreviewRef.current.placement,
          state.trackedBlocks[0].id,
          useWorkspaceStore.getState(),
        );
        setDragMergePreview(box ? { blockId: state.trackedBlocks[0].id, ...box } : null);
      } else {
        setDragMergePreview(null);
      }

      // Live feedback for an imminent detach (legacy fades the old
      // structural wire the moment a drag would detach on release, instead
      // of only showing the change after drop — see useDragConnectorPreview).
      const totalDistance = Math.hypot(clientX - state.startX, clientY - state.startY);
      if (!targetId && totalDistance >= DETACH_BUFFER && !isFlowchartDrag(state.trackedBlocks[0].id) && !isStandaloneContentDrag(state.trackedBlocks[0].id)) {
        const blocksNow = useWorkspaceStore.getState().blocks;
        const roots = getReparentRoots(blocksNow, state.trackedBlocks.map((tracked) => tracked.id))
          .filter((id) => Boolean(blocksNow[id]?.parentId) && !blocksNow[id]?.isFloating);
        setDetachingRootIds(new Set(roots));
      } else {
        setDetachingRootIds(new Set());
      }
    },
    [block, updateBlockTransform]
  );
  applyDragFrameRef.current = applyDragFrame;

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const state = dragStateRef.current;
      if (!state || !state.isDragging) return;
      if (useWorkspaceStore.getState().blocks[blockId]?.style?.isLocked) return;

      state.lastClientX = e.clientX;
      state.lastClientY = e.clientY;

      if (!state.hasActivated) {
        const deltaX = e.clientX - state.startX;
        const deltaY = e.clientY - state.startY;
        if (Math.hypot(deltaX, deltaY) < DRAG_ACTIVATION_THRESHOLD) {
          return;
        }
        state.hasActivated = true;
        useWorkspaceStore.getState().setIsDraggingBlock(true);
        setDraggedBlockIds(state.trackedBlocks.map((tracked) => tracked.id));
      }

      dragAutoPan.reportPointer(e.clientX, e.clientY);
      // Coalesce to one applyDragFrame per animation frame — the browser can
      // fire far more pointermove events than the display refreshes, and each
      // one recomputes snap/reparent-preview and writes to the store, so
      // running it unthrottled is what made this drag feel heavier than the
      // rest of the app's (already rAF-throttled) drag interactions.
      if (moveRafRef.current === null) {
        moveRafRef.current = requestAnimationFrame(() => {
          moveRafRef.current = null;
          const current = dragStateRef.current;
          if (!current || !current.isDragging || !current.hasActivated) return;
          applyDragFrame(current.lastClientX, current.lastClientY);
        });
      }
    },
    [blockId, dragAutoPan, applyDragFrame, setDraggedBlockIds]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (moveRafRef.current !== null) {
        cancelAnimationFrame(moveRafRef.current);
        moveRafRef.current = null;
      }
      const state = dragStateRef.current;
      // Flush any pointer movement the rAF throttle hadn't applied yet, so the
      // committed reparent target/position matches where the pointer actually
      // released rather than the last rendered (up to one frame stale) frame.
      if (state?.isDragging && state.hasActivated) {
        state.lastClientX = e.clientX;
        state.lastClientY = e.clientY;
        applyDragFrame(state.lastClientX, state.lastClientY);
      }
      if (state?.hasActivated) {
        useWorkspaceStore.getState().setIsDraggingBlock(false);
        useWorkspaceStore.getState().setDraggedBlockIds([]);
      }
      setActiveSnapGuides([]);
      setDetachingRootIds(new Set());
      setDragMergePreview(null);
      dragAutoPan.stop();
      if (!state || !state.isDragging) return;
      dragStateRef.current = null;
      const targetId = reparentPreviewRef.current.targetId;
      const placement = reparentPreviewRef.current.placement;
      clearReparentPreview(reparentPreviewRef.current);

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore errors releasing capture
      }

      if (!state.hasActivated) return;
      const movedIds = state.trackedBlocks.map((tracked) => tracked.id);
      const joinedFrame = commitFrameDrop(movedIds);
      if (joinedFrame || isFrameContainerDrag(state.trackedBlocks[0].id)) return;
      if (isFlowchartDrag(state.trackedBlocks[0].id)) return;

      const draggedIds = state.trackedBlocks.map((tracked) => tracked.id);
      const deltaX = e.clientX - state.startX;
      const deltaY = e.clientY - state.startY;
      const totalDistance = Math.hypot(deltaX, deltaY);
      if (isStandaloneContentDrag(state.trackedBlocks[0].id)) {
        if (totalDistance >= DETACH_BUFFER) detachDraggedRoots(draggedIds, removeConnector, updateBlock);
        return;
      }

      const didReparent = commitWorkspaceReparent(targetId, draggedIds, placement);

      if (!didReparent && totalDistance >= DETACH_BUFFER) {
        detachDraggedRoots(draggedIds, removeConnector, updateBlock);
      }

      const blocksAfterDrop = useWorkspaceStore.getState().blocks;
      const canDetach = getReparentRoots(blocksAfterDrop, draggedIds)
        .some((id) => Boolean(blocksAfterDrop[id]?.parentId) && !blocksAfterDrop[id]?.isFloating);
      if (!didReparent && canDetach && totalDistance < DETACH_BUFFER) {
        runSnapBackAnimation(state.trackedBlocks, updateBlockTransform, snapBackRafRef);
      }
    },
    [dragAutoPan, updateBlock, updateBlockTransform, removeConnector, applyDragFrame]
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
