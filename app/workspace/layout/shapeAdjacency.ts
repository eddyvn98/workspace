import type { BlockId, CanvasBlock, Transform } from "../types/block";
import { resolveTransform } from "../types/block";
import { calculateAdjacentBlockPosition, QUICK_ADD_GAP_X, QUICK_ADD_GAP_Y, type QuickAddDirection } from "../hooks/useBlockQuickAdd";
import type { AnchorSide, CanvasConnector } from "../types/connector";

const OPPOSITE_SIDE: Record<AnchorSide, AnchorSide> = { top: "bottom", bottom: "top", left: "right", right: "left", center: "center" };

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

/** How far past a shape's own edge to look before giving up and treating the
 *  direction as empty — mirrors the real product's behavior (Lark): beyond
 *  this, hovering "+" creates a fresh shape instead of reaching for
 *  something far away. */
export const SHAPE_ADJACENCY_SEARCH_DISTANCE = 400;

export interface ShapeAdjacencyMatch {
  blockId: BlockId;
  gap: number;
}

/** Nearest other block sitting in `direction` from `sourceId`, sharing at
 *  least some overlap on the perpendicular axis. Same overlap test as
 *  quickAddHandleGeometry's quickAddExtents, but scanning every block on the
 *  board rather than only ones sharing the same map root — two shapes are
 *  almost always separate roots, so that filter would hide every real
 *  neighbor a shape actually has. */
export function findNearestBlockInDirection(
  sourceId: BlockId,
  direction: QuickAddDirection,
  blocks: Record<BlockId, CanvasBlock>,
): ShapeAdjacencyMatch | null {
  const source = blocks[sourceId];
  if (!source) return null;
  const current = resolveTransform(source.transform, DEFAULT_TRANSFORM);
  let best: ShapeAdjacencyMatch | null = null;

  for (const other of Object.values(blocks)) {
    // "path" connectors were already excluded. A "table" is excluded too -
    // Lark's own quick-add is oblivious to a lane grid drawn behind shapes
    // (the table owns none of them, see swimlaneBands.ts), so a step whose
    // lane header sits directly above it can still get a "+" there instead
    // of the table being mistaken for an occupant in that direction.
    if (other.id === sourceId || other.type === "path" || other.type === "table") continue;
    const candidate = resolveTransform(other.transform, DEFAULT_TRANSFORM);
    const horizontalOverlap = current.x < candidate.x + candidate.w && current.x + current.w > candidate.x;
    const verticalOverlap = current.y < candidate.y + candidate.h && current.y + current.h > candidate.y;
    let gap: number | null = null;
    if (direction === "top" && horizontalOverlap && candidate.y + candidate.h <= current.y) {
      gap = current.y - (candidate.y + candidate.h);
    } else if (direction === "bottom" && horizontalOverlap && candidate.y >= current.y + current.h) {
      gap = candidate.y - (current.y + current.h);
    } else if (direction === "left" && verticalOverlap && candidate.x + candidate.w <= current.x) {
      gap = current.x - (candidate.x + candidate.w);
    } else if (direction === "right" && verticalOverlap && candidate.x >= current.x + current.w) {
      gap = candidate.x - (current.x + current.w);
    }
    if (gap === null || gap > SHAPE_ADJACENCY_SEARCH_DISTANCE) continue;
    if (!best || gap < best.gap) best = { blockId: other.id, gap };
  }
  return best;
}

/**
 * Whether quick-add should offer to CONNECT `sourceId` to the geometrically
 * aligned `targetId` it found, instead of creating a fresh shape.
 *
 * The only disqualifier is a direct edge that already exists between the two
 * - once that relationship is already drawn, hovering the same direction
 * again reaches past it for new territory instead of offering to redraw it.
 * Anything else aligned and not yet directly wired - including a first-time
 * hover toward a parallel lane's same-numbered step - is a legitimate connect
 * offer; Lark does not require the two shapes to already share some other
 * chain first.
 */
export function canQuickAddConnect(
  sourceId: BlockId,
  targetId: BlockId,
  connectors: Record<string, CanvasConnector>,
): boolean {
  const hasDirectEdge = Object.values(connectors).some((connector) =>
    (connector.fromBlockId === sourceId && connector.toBlockId === targetId) ||
    (connector.fromBlockId === targetId && connector.toBlockId === sourceId));
  return !hasDirectEdge;
}

function rectsOverlap(a: Transform, b: Transform): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const SIDE_BY_DIRECTION: Record<QuickAddDirection, AnchorSide> = { top: "top", bottom: "bottom", left: "left", right: "right" };

export interface OpenPositionResult {
  x: number;
  y: number;
  /** Always the side the user actually hovered ("right" stays "right" even
   *  when the shape itself lands above/below, not the source's row) - so the
   *  new connector leaves from that side and bends to reach the shape,
   *  matching the hovered "+"; the shape's own entry side is just the
   *  opposite of that, the natural far side to arrive from after the bend. */
  fromSide: AnchorSide;
  toSide: AnchorSide;
  /**
   * Fixed perpendicular-axis coordinate for the connector's bend, only set
   * when the shape landed off the straight axis (the perpendicular-candidate
   * branch below). Pinning this - instead of leaving the bend to the generic
   * obstacle-avoiding router - keeps every branch off the same source
   * bending at the same trunk line: the router picks whichever elbow is
   * shortest-and-clear for THAT one connector, so a branch that happens to
   * pass near another shape's obstacle gets a different bend point than one
   * that doesn't, breaking the shared-trunk look a repeated quick-add is
   * going for. See CanvasConnector.trunkAxis for why this is a single fixed
   * axis rather than frozen waypoints - it must keep tracking either
   * endpoint's live position if the shape is dragged afterward.
   */
  trunkAxis?: number;
}

/**
 * Where a quick-add "create" shape should actually land when the straight
 * spot is already taken by an already-connected shape: aligned with THAT
 * blocking shape's own column (for a left/right hover) or row (for a
 * top/bottom hover) - not beside it in the source's own row/column - in the
 * nearest free slot along that line. Confirmed directly against Lark: hovering
 * "right" into an already-connected neighbor lands the new shape stacked
 * with that neighbor (same column), not further right past it.
 */
export function findOpenPositionInDirection(
  sourceId: BlockId,
  direction: QuickAddDirection,
  blocks: Record<BlockId, CanvasBlock>,
  newSize: { w: number; h: number },
): OpenPositionResult {
  const source = blocks[sourceId];
  if (!source) return { x: 0, y: 0, fromSide: SIDE_BY_DIRECTION[direction], toSide: OPPOSITE_SIDE[SIDE_BY_DIRECTION[direction]] };
  const current = resolveTransform(source.transform, DEFAULT_TRANSFORM);
  const horizontal = direction === "left" || direction === "right";
  const baseGap = horizontal ? QUICK_ADD_GAP_X : QUICK_ADD_GAP_Y;
  const obstacles = Object.values(blocks)
    .filter((block) => block.id !== sourceId && block.type !== "path" && block.type !== "table")
    .map((block) => resolveTransform(block.transform, DEFAULT_TRANSFORM));
  const isClear = (pos: { x: number; y: number }) => {
    const candidate: Transform = { ...pos, w: newSize.w, h: newSize.h, rotation: 0, zIndex: 0 };
    return !obstacles.some((rect) => rectsOverlap(candidate, rect));
  };
  const straightSide = SIDE_BY_DIRECTION[direction];

  const straightPos = horizontal
    ? calculateAdjacentBlockPosition(current, direction, newSize, baseGap, QUICK_ADD_GAP_Y)
    : calculateAdjacentBlockPosition(current, direction, newSize, QUICK_ADD_GAP_X, baseGap);
  if (isClear(straightPos)) return { ...straightPos, fromSide: straightSide, toSide: OPPOSITE_SIDE[straightSide] };

  // Blocked: stay in the blocking shape's own column/row (straightPos.x/y
  // already sits there, since that's where the blocker is) and walk along
  // the perpendicular axis for the nearest free slot - preferring "up"/
  // "left" first, since that is the side the reference tool's own empty
  // header row happened to be on in the confirmed case. The connector still
  // leaves from `straightSide` (the hovered side) regardless - only the
  // shape's own position moves off that axis, not which side of the source
  // the wire exits from.
  const perpStep = horizontal ? newSize.h + QUICK_ADD_GAP_Y : newSize.w + QUICK_ADD_GAP_X;
  const trunkAxis = horizontal
    ? (direction === "right" ? current.x + current.w + baseGap / 2 : current.x - baseGap / 2)
    : (direction === "bottom" ? current.y + current.h + baseGap / 2 : current.y - baseGap / 2);
  for (let step = 1; step <= 10; step += 1) {
    for (const sign of [-1, 1]) {
      const pos = horizontal
        ? { x: straightPos.x, y: straightPos.y + sign * step * perpStep }
        : { x: straightPos.x + sign * step * perpStep, y: straightPos.y };
      if (isClear(pos)) return { ...pos, fromSide: straightSide, toSide: OPPOSITE_SIDE[straightSide], trunkAxis };
    }
  }

  let gap = baseGap;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pos = horizontal
      ? calculateAdjacentBlockPosition(current, direction, newSize, gap, QUICK_ADD_GAP_Y)
      : calculateAdjacentBlockPosition(current, direction, newSize, QUICK_ADD_GAP_X, gap);
    const candidate: Transform = { ...pos, w: newSize.w, h: newSize.h, rotation: 0, zIndex: 0 };
    const blocker = obstacles.find((rect) => rectsOverlap(candidate, rect));
    if (!blocker) return { ...pos, fromSide: straightSide, toSide: OPPOSITE_SIDE[straightSide] };
    gap = direction === "right" ? blocker.x + blocker.w - (current.x + current.w) + baseGap
      : direction === "left" ? current.x - blocker.x + baseGap
      : direction === "bottom" ? blocker.y + blocker.h - (current.y + current.h) + baseGap
      : current.y - blocker.y + baseGap;
  }
  const fallbackPos = calculateAdjacentBlockPosition(current, direction, newSize);
  return { ...fallbackPos, fromSide: straightSide, toSide: OPPOSITE_SIDE[straightSide] };
}
