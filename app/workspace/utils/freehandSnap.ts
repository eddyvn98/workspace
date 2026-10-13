/**
 * Snap-to-node/endpoint/midpoint for freehand shape tools (line, arrow,
 * square, circle) — Tier 3 item 15 in canvas-engine-v2-parity-gap-audit.md
 * ("Freehand CAD toolkit / snapping"), scoped to just this one sub-feature
 * for v1 (not the full CAD toolkit — no move/copy/rotate/mirror/offset, no
 * angle-snapping, no polyline chaining, no marquee-select; those remain
 * disclosed gaps). Works in screen space since drawPoints/pointer events
 * already are.
 */
import type { Position } from "../types/block";
import { anchorRegistry } from "../connectors/anchorRegistry";

const SNAP_THRESHOLD_PX = 10;

/** 9 candidate points per block: 4 corners, 4 edge-midpoints, center. */
function candidatesForRect(rect: DOMRect): Position[] {
  const { left, top, right, bottom, width, height } = rect;
  const midX = left + width / 2;
  const midY = top + height / 2;
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: midX, y: top },
    { x: midX, y: bottom },
    { x: left, y: midY },
    { x: right, y: midY },
    { x: midX, y: midY },
  ];
}

/** Finds the nearest snap candidate (block corner/edge-midpoint/center)
 *  within SNAP_THRESHOLD_PX of `point`, excluding `excludeBlockId` (the
 *  block currently being drawn, if any). Returns null when nothing is
 *  close enough — callers should fall back to the raw point. */
export function findSnapPoint(
  point: Position,
  blockIds: string[],
  excludeBlockId?: string | null
): Position | null {
  let best: Position | null = null;
  let bestDist = SNAP_THRESHOLD_PX;

  for (const id of blockIds) {
    if (id === excludeBlockId) continue;
    const rect = anchorRegistry.getBlockRect(id);
    if (!rect) continue;
    for (const candidate of candidatesForRect(rect)) {
      const dx = candidate.x - point.x;
      const dy = candidate.y - point.y;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
  }

  return best;
}

/** Constrains `end` to the nearest 45° increment around `start`, preserving
 *  distance — the old app's CAD toolkit's angle-snapping, scoped here to
 *  the two directional line tools (cad_line/arrow_line only; square/circle
 *  use width/height, not an angle). Shift-to-snap, same modifier convention
 *  as most vector-drawing tools. */
export function snapAngle(start: Position, end: Position): Position {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return end;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snappedAngle = Math.round(angle / step) * step;
  return {
    x: start.x + distance * Math.cos(snappedAngle),
    y: start.y + distance * Math.sin(snappedAngle),
  };
}
