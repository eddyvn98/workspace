import type { BlockId, CanvasBlock, Transform } from "../types/block";
import { resolveTransform } from "../types/block";
import { findMapRootId } from "../layout/mapRoot";
import type { QuickAddDirection } from "../hooks/useBlockQuickAdd";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
const QUICK_ADD_HANDLE_SIZE = 24;
const QUICK_ADD_HANDLE_GAP = 10;
export type QuickAddExtents = Record<QuickAddDirection, number>;

export function quickAddExtents(blockId: BlockId, blocks: Record<BlockId, CanvasBlock>): QuickAddExtents {
  const block = blocks[blockId];
  if (!block) return { top: 0, right: 0, bottom: 0, left: 0 };
  const current = resolveTransform(block.transform, DEFAULT_TRANSFORM);
  const rootId = findMapRootId(blocks, blockId);
  let top = Infinity;
  let right = Infinity;
  let bottom = Infinity;
  let left = Infinity;

  Object.values(blocks).forEach((other) => {
    if (other.id === blockId || findMapRootId(blocks, other.id) !== rootId) return;
    const candidate = resolveTransform(other.transform, DEFAULT_TRANSFORM);
    const horizontalOverlap = current.x < candidate.x + candidate.w && current.x + current.w > candidate.x;
    const verticalOverlap = current.y < candidate.y + candidate.h && current.y + current.h > candidate.y;
    if (horizontalOverlap) {
      if (candidate.y + candidate.h <= current.y) top = Math.min(top, current.y - (candidate.y + candidate.h));
      if (candidate.y >= current.y + current.h) bottom = Math.min(bottom, candidate.y - (current.y + current.h));
    }
    if (verticalOverlap) {
      if (candidate.x + candidate.w <= current.x) left = Math.min(left, current.x - (candidate.x + candidate.w));
      if (candidate.x >= current.x + current.w) right = Math.min(right, candidate.x - (current.x + current.w));
    }
  });

  return {
    top: Math.max(0, Math.min(40, top)),
    right: Math.max(0, Math.min(40, right)),
    bottom: Math.max(0, Math.min(40, bottom)),
    left: Math.max(0, Math.min(40, left)),
  };
}

export function quickAddHandleOffset(direction: QuickAddDirection, extents: QuickAddExtents): number | null {
  const available = extents[direction];
  if (available <= 0) return null;
  const compact = available < QUICK_ADD_HANDLE_GAP * 2;
  const offset = compact
    ? available / 2
    : Math.min(QUICK_ADD_HANDLE_GAP, available - QUICK_ADD_HANDLE_GAP);
  return offset >= 6 ? offset : null;
}

export const QUICK_ADD_BUTTON_SIZE = QUICK_ADD_HANDLE_SIZE;
