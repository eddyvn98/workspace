import { resolveTransform, type BlockId, type CanvasBlock, type Transform } from "../types/block";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

/** Gap between a parent and the node placed off it, and between a rejected
 *  candidate spot and the next one tried. */
const FLOW_GAP = 72;
const SIDE_STEP = 40;
/** Treat two boxes as colliding a little before they actually touch, so a new
 *  node never lands flush against a neighbour. */
const CLEARANCE = 16;

export type FreeFormSide = "bottom" | "top" | "right" | "left";

/**
 * Where to put a node the user just added to a FREE-FORM map (a flowchart),
 * where no layout pass will place it for them.
 *
 * An auto-arranged family gets its positions from its layout calculator, so
 * the node's initial coordinates do not matter. A free-form family has no such
 * pass — without this the node would sit at the origin, far from the map it
 * belongs to.
 *
 * Places the node one gap off the parent on the requested side, then slides it
 * along until it stops overlapping anything. Sliding rather than stacking is
 * what keeps a flowchart's second branch beside the first instead of on top
 * of it.
 */
export function findFreeFormSpot(
  blocks: Record<BlockId, CanvasBlock>,
  parentId: BlockId,
  size: { w: number; h: number },
  side: FreeFormSide = "bottom",
): { x: number; y: number } {
  const parent = blocks[parentId];
  const parentBox = parent ? resolveTransform(parent.transform, DEFAULT_TRANSFORM) : DEFAULT_TRANSFORM;

  const start = firstCandidate(parentBox, size, side);
  const occupied = Object.values(blocks)
    .filter((block) => block.id !== parentId)
    .map((block) => resolveTransform(block.transform, DEFAULT_TRANSFORM));

  // Step perpendicular to the flow: a node added below its parent slides
  // sideways, one added to the right slides downward.
  const stepX = side === "bottom" || side === "top" ? SIDE_STEP : 0;
  const stepY = side === "bottom" || side === "top" ? 0 : SIDE_STEP;

  let candidate = start;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (!overlapsAny(candidate, size, occupied)) return candidate;
    candidate = { x: candidate.x + stepX, y: candidate.y + stepY };
  }
  return start;
}

function firstCandidate(
  parentBox: Transform,
  size: { w: number; h: number },
  side: FreeFormSide,
): { x: number; y: number } {
  const centreX = parentBox.x + parentBox.w / 2 - size.w / 2;
  const centreY = parentBox.y + parentBox.h / 2 - size.h / 2;

  switch (side) {
    case "top":
      return { x: centreX, y: parentBox.y - FLOW_GAP - size.h };
    case "right":
      return { x: parentBox.x + parentBox.w + FLOW_GAP, y: centreY };
    case "left":
      return { x: parentBox.x - FLOW_GAP - size.w, y: centreY };
    default:
      return { x: centreX, y: parentBox.y + parentBox.h + FLOW_GAP };
  }
}

function overlapsAny(
  point: { x: number; y: number },
  size: { w: number; h: number },
  occupied: Transform[],
): boolean {
  return occupied.some((box) => (
    point.x < box.x + box.w + CLEARANCE
    && point.x + size.w + CLEARANCE > box.x
    && point.y < box.y + box.h + CLEARANCE
    && point.y + size.h + CLEARANCE > box.y
  ));
}
