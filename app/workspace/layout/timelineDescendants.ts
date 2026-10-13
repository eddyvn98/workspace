/**
 * Descendant-fanout helpers for the "hierarchy" timeline descendant style.
 * Split out of timelineLayout.ts to keep that file under the 300-line limit.
 * Mirrors app/mindmap/hooks/layouts/layoutTimeline.ts's
 * layoutHierarchyDescendants (for horizontal timelines) and
 * layoutVertTimelineDescendants (for vertical timelines).
 */

import type { BlockId } from "../types/block";
import { ALONG_GAP } from "./treeLayout";
import type { TimelineAxis, TimelineLayoutPoint, TimelineLayoutSize } from "./timelineLayout";

const DEFAULT_SIZE: TimelineLayoutSize = { w: 160, h: 80 };

/** Row gap inside a centered horizontal-hierarchy band. Matches legacy's
 *  HIERARCHY_ROW_GAP (layoutTimeline.ts) — deliberately wider than CROSS_GAP
 *  (14px), which is reserved for the along-timeline stacking gap. */
const HIERARCHY_ROW_GAP = 20;
export const VERT_TIMELINE_GAP = 28;

export interface HierarchyExtent {
  /** How far this node's own band reaches above its center row. */
  before: number;
  /** How far this node's own band reaches below its center row. */
  after: number;
}

/** Directional counterpart to a subtree-height sum, matching legacy's
 *  calcHierarchyExtents (layoutTimeline.ts): a node centered on its own
 *  children's band needs room on both sides of its own row, not just below
 *  it — so every ancestor up the chain has to reserve its full descendant
 *  band, not merely its own footprint. The band runs across the CROSS
 *  dimension of `axis` — height for a horizontal timeline (fans up/down),
 *  width for a vertical one (fans left/right) — since each hierarchy chain
 *  keeps growing along its timeline's own along-axis, one column/row deeper
 *  per level, transposed from the other axis's chain. */
export function calcTimelineHierarchyExtent(
  id: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TimelineLayoutSize>,
  out: Map<BlockId, HierarchyExtent>,
  axis: TimelineAxis,
): HierarchyExtent {
  const size = sizes.get(id) ?? DEFAULT_SIZE;
  // Both legacy timeline hierarchy variants fan descendants vertically. The
  // vertical timeline changes the milestone rail axis, but its hierarchy
  // descendants still grow left/right and are centered by their Y extents.
  const ownHalf = size.h / 2;
  const children = childrenByParent.get(id) ?? [];
  if (children.length === 0) {
    const leaf: HierarchyExtent = { before: ownHalf, after: ownHalf };
    out.set(id, leaf);
    return leaf;
  }
  let span = 0;
  children.forEach((childId, index) => {
    const childExtent = calcTimelineHierarchyExtent(childId, childrenByParent, sizes, out, axis);
    span += childExtent.before + childExtent.after + (index ? HIERARCHY_ROW_GAP : 0);
  });
  const half = Math.max(ownHalf, span / 2);
  const extent: HierarchyExtent = { before: half, after: half };
  out.set(id, extent);
  return extent;
}

export function layoutTimelineHierarchyDescendants(
  parentId: BlockId,
  parentPoint: TimelineLayoutPoint,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TimelineLayoutSize>,
  axis: TimelineAxis,
  out: Map<BlockId, TimelineLayoutPoint>,
  growthDirection: -1 | 1 = 1,
  levelOffsets?: Map<number, number>,
  level = 0,
): number {
  const parentSize = sizes.get(parentId) ?? DEFAULT_SIZE;
  const children = childrenByParent.get(parentId) ?? [];
  // Vertical-axis callers need the subtree's max Y extent to space the next
  // milestone below it — irrelevant for horizontal callers, who ignore it.
  let maxExtent = parentPoint.y + parentSize.h;
  if (children.length === 0) return maxExtent;

  if (axis === "horizontal") {
    // Horizontal hierarchy grows sideways (further right, one column per
    // depth) and fans vertically — matching legacy's layoutHierarchyDescendants
    // bracket. Children are centered as a band around the parent's own row
    // using their real subtree extents (not flat index spacing), so a deep
    // fork doesn't collide with its own siblings' bands.
    const extents = new Map<BlockId, HierarchyExtent>();
    children.forEach((childId) => calcTimelineHierarchyExtent(childId, childrenByParent, sizes, extents, axis));
    const totalSpan = children.reduce(
      (total, childId, index) => total + extents.get(childId)!.before + extents.get(childId)!.after + (index ? HIERARCHY_ROW_GAP : 0),
      0,
    );
    const parentCenterY = parentPoint.y + parentSize.h / 2;
    let cursor = parentCenterY - totalSpan / 2;
    children.forEach((childId) => {
      const ext = extents.get(childId)!;
      const childSize = sizes.get(childId) ?? DEFAULT_SIZE;
      const childCenterY = cursor + ext.before;
      const childColumn = levelOffsets?.get(level) ?? parentPoint.x + parentSize.w + ALONG_GAP;
      const point = { x: childColumn, y: childCenterY - childSize.h / 2 };
      out.set(childId, point);
      const childExtent = layoutTimelineHierarchyDescendants(childId, point, childrenByParent, sizes, axis, out, growthDirection, levelOffsets, level + 1);
      maxExtent = Math.max(maxExtent, childExtent, childCenterY + ext.after);
      cursor += ext.before + ext.after + HIERARCHY_ROW_GAP;
    });
    return maxExtent;
  }

  // Legacy vertical timeline hierarchy keeps the same horizontal hierarchy
  // fan used by layoutHierarchyDescendants: descendants grow left/right from
  // the milestone and are centered on their vertical band. Only the main
  // milestone rail is vertical; this branch must not be transposed onto Y.
  const extents = new Map<BlockId, HierarchyExtent>();
  children.forEach((childId) => calcTimelineHierarchyExtent(childId, childrenByParent, sizes, extents, axis));
  const totalSpan = children.reduce(
    (total, childId, index) => total + extents.get(childId)!.before + extents.get(childId)!.after + (index ? HIERARCHY_ROW_GAP : 0),
    0,
  );
  const parentCenterY = parentPoint.y + parentSize.h / 2;
  let cursor = parentCenterY - totalSpan / 2;
  children.forEach((childId) => {
    const ext = extents.get(childId)!;
    const childSize = sizes.get(childId) ?? DEFAULT_SIZE;
    const childCenterY = cursor + ext.before;
    const point = growthDirection > 0
      ? { x: parentPoint.x + parentSize.w + ALONG_GAP, y: childCenterY - childSize.h / 2 }
      : { x: parentPoint.x - ALONG_GAP - childSize.w, y: childCenterY - childSize.h / 2 };
    out.set(childId, point);
    const childExtent = layoutTimelineHierarchyDescendants(childId, point, childrenByParent, sizes, axis, out, growthDirection);
    maxExtent = Math.max(maxExtent, childExtent, childCenterY + ext.after);
    cursor += ext.before + ext.after + HIERARCHY_ROW_GAP;
  });
  return maxExtent;
}

/**
 * "tree" descendant style for horizontal timelines: a ladder that continues
 * indenting one column per depth (mirrors the milestone->activity indent)
 * while stacking children vertically in the same direction the activity
 * itself branched (`isTop`). Matches legacy's layoutTimelineSubtree recursion
 * for level 3+ nodes — previously this level had NO recursive layout call at
 * all for the horizontal "tree" style, so every node past an activity was
 * left unpositioned (missing from `out`), which is the root cause of the
 * "activity level missing / nodes broken" report: anything downstream that
 * reads a level-3+ point got `undefined`/NaN.
 */
export function layoutTimelineHorizontalTreeDescendants(
  parentId: BlockId,
  parentPoint: TimelineLayoutPoint,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TimelineLayoutSize>,
  isTop: boolean,
  alongGap: number,
  crossGap: number,
  out: Map<BlockId, TimelineLayoutPoint>,
  levelOffsets?: Map<number, number>,
  parentLevel = 0,
): number {
  const parentSize = sizes.get(parentId) ?? DEFAULT_SIZE;
  const children = childrenByParent.get(parentId) ?? [];
  if (children.length === 0) return isTop ? parentPoint.y : parentPoint.y + parentSize.h;

  const childX = levelOffsets?.get(parentLevel + 1) ?? parentPoint.x + parentSize.w + alongGap;
  let cursorY = isTop ? parentPoint.y - crossGap : parentPoint.y + parentSize.h + crossGap;
  let outerEdge = cursorY;

  children.forEach((childId) => {
    const childSize = sizes.get(childId) ?? DEFAULT_SIZE;
    const childY = isTop ? cursorY - childSize.h : cursorY;
    const childPoint = { x: childX, y: childY };
    out.set(childId, childPoint);
    const branchEdge = layoutTimelineHorizontalTreeDescendants(childId, childPoint, childrenByParent, sizes, isTop, alongGap, crossGap, out, levelOffsets, parentLevel + 1);
    outerEdge = isTop ? Math.min(outerEdge, branchEdge) : Math.max(outerEdge, branchEdge);
    cursorY = isTop ? branchEdge - crossGap : branchEdge + crossGap;
  });

  return outerEdge;
}

/**
 * Places one milestone's activities (and, recursively, everything past them)
 * for a horizontal timeline, and returns the branch's max width so the
 * caller can space the next milestone. Split out of computeTimelineTreeLayout
 * to keep timelineLayout.ts under the 300-line project limit.
 */
export function layoutTimelineHorizontalMilestoneActivities(
  milestoneId: BlockId,
  mSize: TimelineLayoutSize,
  cursorX: number,
  mY: number,
  isTop: boolean,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TimelineLayoutSize>,
  alongGap: number,
  crossGap: number,
  isHierarchy: boolean,
  out: Map<BlockId, TimelineLayoutPoint>,
  levelOffsets?: Map<number, number>,
  milestoneLevel = 1,
): number {
  const activities = childrenByParent.get(milestoneId) ?? [];
  const branchStartIds = new Set(out.keys());
  // Legacy (layoutTimelineSubtree) indents each activity into its own depth
  // column past the milestone's right edge, rather than stacking it directly
  // at the milestone's own X.
  const actX = levelOffsets?.get(milestoneLevel + 1) ?? cursorX + mSize.w + alongGap;
  let actCursorY = isTop ? mY - crossGap : mY + mSize.h + crossGap;
  let branchMaxW = mSize.w;

  for (const actId of activities) {
    const actSize = sizes.get(actId) ?? DEFAULT_SIZE;

    if (isHierarchy) {
      // Reserve the activity's full descendant band (legacy's
      // calcHierarchyExtents), centering the activity on the MIDLINE of that
      // band rather than at the reserved segment's leading edge — otherwise
      // the band's far half runs back over the previous activity/milestone
      // axis.
      const extents = new Map<BlockId, HierarchyExtent>();
      const ext = calcTimelineHierarchyExtent(actId, childrenByParent, sizes, extents, "horizontal");
      const actCenterY = isTop ? actCursorY - ext.after : actCursorY + ext.before;
      const actY = actCenterY - actSize.h / 2;
      const actPoint = { x: actX, y: actY };
      out.set(actId, actPoint);
      branchMaxW = Math.max(branchMaxW, mSize.w + alongGap + actSize.w);
      layoutTimelineHierarchyDescendants(actId, actPoint, childrenByParent, sizes, "horizontal", out, 1, levelOffsets, milestoneLevel + 2);
      actCursorY = isTop ? actCursorY - ext.after - ext.before - crossGap : actCursorY + ext.before + ext.after + crossGap;
    } else {
      // "tree" style: ladder that keeps indenting one column per depth (see
      // layoutTimelineHorizontalTreeDescendants) — reserve the full subtree
      // extent so a deep activity doesn't collide with the next one's own row.
      const actY = isTop ? actCursorY - actSize.h : actCursorY;
      const actPoint = { x: actX, y: actY };
      out.set(actId, actPoint);
      branchMaxW = Math.max(branchMaxW, mSize.w + alongGap + actSize.w);
      const branchEdge = layoutTimelineHorizontalTreeDescendants(actId, actPoint, childrenByParent, sizes, isTop, alongGap, crossGap, out, levelOffsets, milestoneLevel + 1);
      actCursorY = isTop ? branchEdge - crossGap : branchEdge + crossGap;
    }
  }

  let maxRight = cursorX + branchMaxW;
  for (const [id, point] of out) {
    if (branchStartIds.has(id)) continue;
    const size = sizes.get(id) ?? DEFAULT_SIZE;
    maxRight = Math.max(maxRight, point.x + size.w);
  }
  return Math.max(branchMaxW, maxRight - cursorX);
}

// Matches legacy layoutVertTimelineDescendants: the branch axis is offset from
// the parent's own edge by X_GAP (ALONG_GAP, 65px) plus 24px per extra depth —
// NOT by CROSS_GAP (14px), which is reserved for the along-timeline stacking
// gap. Using CROSS_GAP here collapsed every deeper hierarchy fork almost on
// top of its parent's edge.
export function layoutTimelineVerticalDescendants(
  parentId: BlockId,
  parentPoint: TimelineLayoutPoint,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TimelineLayoutSize>,
  side: -1 | 1,
  out: Map<BlockId, TimelineLayoutPoint>,
  depth = 1,
): number {
  const DEFAULT_SIZE: TimelineLayoutSize = { w: 160, h: 80 };
  const parentSize = sizes.get(parentId) ?? DEFAULT_SIZE;
  const children = childrenByParent.get(parentId) ?? [];
  if (children.length === 0) {
    return parentPoint.y + parentSize.h;
  }

  const branchX = side < 0
    ? parentPoint.x - ALONG_GAP - depth * 24
    : parentPoint.x + parentSize.w + ALONG_GAP + depth * 24;
  let bottom = parentPoint.y + parentSize.h;
  let childY = bottom + VERT_TIMELINE_GAP;

  children.forEach((childId) => {
    const childSize = sizes.get(childId) ?? DEFAULT_SIZE;
    const childPoint = side < 0
      ? { x: parentPoint.x - parentSize.w - ALONG_GAP - depth * 24, y: childY }
      : { x: branchX, y: childY };
    out.set(childId, childPoint);
    const childBottom = layoutTimelineVerticalDescendants(childId, childPoint, childrenByParent, sizes, side, out, depth + 1);
    const subtreeBottom = Math.max(childBottom, childY + childSize.h);
    bottom = Math.max(bottom, subtreeBottom);
    childY = subtreeBottom + VERT_TIMELINE_GAP;
  });

  return bottom;
}
