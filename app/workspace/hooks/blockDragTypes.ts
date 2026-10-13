import type { BlockId, Transform } from "../types/block";

export const DEFAULT_DRAG_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
export const GRID_SIZE = 20;
export const DRAG_ACTIVATION_THRESHOLD = 8;
// Match the legacy Mindmap detach buffer. A normal reposition must keep its
// structural connector; detaching only starts after a deliberate long drag.
export const DETACH_BUFFER = 56;
export const SNAP_BACK_DURATION_MS = 150;

export function collectDragBlockIds(
  blocks: Record<BlockId, { id: BlockId; parentId?: BlockId; data?: unknown; style?: { isLocked?: boolean } }>,
  sourceId: BlockId,
  selectedIds: Iterable<BlockId>,
): BlockId[] {
  const selected = new Set(selectedIds);
  const requested = new Set((selected.has(sourceId) ? selected : new Set([sourceId])));
  [...requested].forEach((id) => {
    if (!blocks[id] || blocks[id].style?.isLocked) requested.delete(id);
  });
  const childrenByParent = new Map<BlockId, BlockId[]>();
  Object.values(blocks).forEach((block) => {
    if (!block.parentId) return;
    childrenByParent.set(block.parentId, [...(childrenByParent.get(block.parentId) ?? []), block.id]);
  });

  const roots = [...requested].filter((id) => {
    const seen = new Set<BlockId>();
    let parentId = blocks[id]?.parentId;
    while (parentId && !seen.has(parentId)) {
      if (requested.has(parentId)) return false;
      seen.add(parentId);
      parentId = blocks[parentId]?.parentId;
    }
    return true;
  });
  const result: BlockId[] = [];
  const visited = new Set<BlockId>();
  const visit = (id: BlockId) => {
    if (visited.has(id) || !blocks[id] || blocks[id].style?.isLocked) return;
    visited.add(id);
    result.push(id);
    childrenByParent.get(id)?.forEach(visit);
    const data = blocks[id]?.data as { frameBlockIds?: unknown } | undefined;
    if (Array.isArray(data?.frameBlockIds)) data.frameBlockIds.forEach((member) => {
      if (typeof member === "string" && !blocks[member]?.style?.isLocked) visit(member);
    });
  };
  roots.forEach(visit);
  return result.length > 0 ? result : [sourceId];
}

export interface TrackedBlock {
  id: BlockId;
  initialX: number;
  initialY: number;
}

export interface DragState {
  isDragging: boolean;
  hasActivated: boolean;
  startX: number;
  startY: number;
  lastClientX: number;
  lastClientY: number;
  trackedBlocks: TrackedBlock[];
}
