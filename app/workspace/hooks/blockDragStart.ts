import type React from "react";
import { isStandaloneContentBlockType, resolveTransform, type BlockId, type Transform } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { currentMapLayout } from "../layout/mapRoot";
import { DEFAULT_DRAG_TRANSFORM, collectDragBlockIds, type DragState } from "./blockDragTypes";
import { findSwimlaneAnchoredBlockIds, isSwimlaneAnchorTable } from "../utils/swimlaneTableAnchors";

/** A flowchart's connectors are decision logic (Yes/No branches), not a
 *  generic tree a drag should be free to rearrange - unlike a mindmap or
 *  hierarchy map, dragging a shape near or away from another one here must
 *  never silently detach or re-home its wire (see blockDragReparent.ts). */
export function isFlowchartDrag(blockId: BlockId): boolean {
  const state = useWorkspaceStore.getState();
  return currentMapLayout(state, blockId).family === "flowchart";
}

export function isFrameContainerDrag(blockId: BlockId): boolean {
  const block = useWorkspaceStore.getState().blocks[blockId];
  return block?.type === "shape" && Array.isArray((block.data as { frameBlockIds?: unknown }).frameBlockIds);
}

export function isStandaloneContentDrag(blockId: BlockId): boolean {
  return isStandaloneContentBlockType(useWorkspaceStore.getState().blocks[blockId]?.type) || isFrameContainerDrag(blockId);
}

export function createBlockDragState(blockId: BlockId, initialTransform: Transform | undefined, e: React.PointerEvent<HTMLElement>, selectedBlockIds: BlockId[]): DragState {
  const hasModifier = e.shiftKey || e.ctrlKey || e.metaKey;
  if (hasModifier) {
    useWorkspaceStore.getState().setSelection(
      selectedBlockIds.includes(blockId)
        ? selectedBlockIds.filter((id) => id !== blockId)
        : [...selectedBlockIds, blockId]
    );
  } else if (!selectedBlockIds.includes(blockId)) {
    useWorkspaceStore.getState().setSelection([blockId]);
  }

  const allBlocks = useWorkspaceStore.getState().blocks;
  const requestedIds = hasModifier ? [blockId] : selectedBlockIds;
  const trackedIds = collectDragBlockIds(allBlocks, blockId, requestedIds);
  // Dragging a swimlane's lane-grid table carries its freeform step
  // shapes along, matching Lark - they have no parentId/cellItems link
  // (disableCellAttachment), so collectDragBlockIds alone can't see them.
  const draggedTable = allBlocks[blockId];
  const anchoredIds = isSwimlaneAnchorTable(draggedTable)
    ? findSwimlaneAnchoredBlockIds(allBlocks, draggedTable)
    : [];
  const finalIds = anchoredIds.length > 0 ? [...new Set([...trackedIds, ...anchoredIds])] : trackedIds;
  const trackedBlocks = finalIds.map((id) => {
    const current = allBlocks[id];
    const transform = id === blockId && initialTransform
      ? initialTransform
      : current ? resolveTransform(current.transform, DEFAULT_DRAG_TRANSFORM) : DEFAULT_DRAG_TRANSFORM;
    return { id, initialX: transform.x, initialY: transform.y };
  });

  return {
    isDragging: true,
    hasActivated: false,
    startX: e.clientX,
    startY: e.clientY,
    lastClientX: e.clientX,
    lastClientY: e.clientY,
    trackedBlocks,
  };

}
