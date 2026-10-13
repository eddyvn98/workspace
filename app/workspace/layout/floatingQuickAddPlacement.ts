import { findMapRootId } from "./mapRoot";
import { resolveTransform, type BlockId, type CanvasBlock, type Transform } from "../types/block";
import type { QuickAddDirection } from "../hooks/useBlockQuickAdd";

const FLOATING_GAP = 80;
const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

function overlaps(a: { x: number; y: number; w: number; h: number }, b: Transform) {
  return a.x < b.x + b.w && a.x + a.w > b.x
    && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Place a child of a detached group with legacy's 80px gap and cross-axis
 * search. Floating nodes remain user-positioned; they must not be fed through
 * the structured tree reflow that would pull them back into a hierarchy. */
export function calculateFloatingQuickAddPosition(
  blocks: Record<BlockId, CanvasBlock>,
  sourceId: BlockId,
  source: Transform,
  direction: QuickAddDirection,
  size: { w: number; h: number },
): { x: number; y: number } {
  const horizontal = direction === "left" || direction === "right";
  const base = direction === "right"
    ? { x: source.x + source.w + FLOATING_GAP, y: source.y + (source.h - size.h) / 2 }
    : direction === "left"
      ? { x: source.x - size.w - FLOATING_GAP, y: source.y + (source.h - size.h) / 2 }
      : direction === "bottom"
        ? { x: source.x + (source.w - size.w) / 2, y: source.y + source.h + FLOATING_GAP }
        : { x: source.x + (source.w - size.w) / 2, y: source.y - size.h - FLOATING_GAP };
  const rootId = findMapRootId(blocks, sourceId);
  const occupied = Object.values(blocks)
    .filter((block) => block.id !== sourceId && findMapRootId(blocks, block.id) === rootId)
    .map((block) => resolveTransform(block.transform, DEFAULT_TRANSFORM));
  const crossStep = (horizontal ? size.h : size.w) + FLOATING_GAP;

  for (let attempt = 0; attempt <= occupied.length + 8; attempt += 1) {
    const distance = attempt === 0 ? 0 : Math.ceil(attempt / 2) * crossStep;
    const sign = attempt > 0 && attempt % 2 === 0 ? -1 : 1;
    const candidate = horizontal
      ? { x: base.x, y: base.y + distance * sign, w: size.w, h: size.h }
      : { x: base.x + distance * sign, y: base.y, w: size.w, h: size.h };
    if (!occupied.some((other) => overlaps(candidate, other))) return { x: candidate.x, y: candidate.y };
  }
  return base;
}
