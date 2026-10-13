/**
 * Pure timeline auto-arrange layout (no React/store dependencies).
 * See CONTRACTS.md §32 — ports the old app's timeline family
 * (app/mindmap/hooks/layouts/layoutTimeline.ts, layoutTimelineHorizontal.ts,
 * layoutTimelineVertical.ts, timelineRails.ts).
 *
 * Geometry & Semantics:
 * 1. Flat selection arrange:
 *    - Main rail (horizontal along X or vertical along Y) anchored at (startX, startY).
 *    - Positions blocks along the rail sequence (selection order), centered on rail axis
 *      or alternating across the rail when branchMode is "alternate".
 * 2. Tree-structured timeline:
 *    - Root anchors the timeline; direct children are milestones along the axis.
 *    - Deeper descendants form activity ladders/subtrees branching perpendicularly.
 * 3. Connection semantics:
 *    - Main rail segment connectors ("straight" lineType).
 *    - Milestone-to-activity branch stubs and descendant links.
 */

import type { BlockId } from "../types/block";
import { ALONG_GAP, CROSS_GAP } from "./treeLayout";
import { collectTimelineLevelWidths, computeTimelineLevelOffsets } from "./timelineLevelColumns";
import {
  layoutTimelineHierarchyDescendants,
  layoutTimelineHorizontalMilestoneActivities,
  layoutTimelineVerticalDescendants,
  VERT_TIMELINE_GAP,
} from "./timelineDescendants";

export type TimelineAxis = "horizontal" | "vertical";
export type TimelineBranchMode = "auto" | "one-side" | "one-side-reverse" | "alternate" | "spine";
export type TimelineDescendantStyle = "tree" | "hierarchy";

export interface TimelineLayoutSize {
  w: number;
  h: number;
}

export interface TimelineLayoutPoint {
  x: number;
  y: number;
}

export interface TimelineLayoutOptions {
  axis?: TimelineAxis;
  branchMode?: TimelineBranchMode;
  alongGap?: number;
  crossGap?: number;
}

export interface TimelineTreeLayoutOptions extends TimelineLayoutOptions {
  descendantStyle?: TimelineDescendantStyle;
}

export interface TimelineConnectionSpec {
  id: string;
  fromBlockId: BlockId;
  toBlockId: BlockId;
  lineType: "straight" | "orthogonal" | "curved";
  role?: "rail" | "branch" | "descendant";
}

const DEFAULT_SIZE: TimelineLayoutSize = { w: 160, h: 80 };

// Legacy's milestone→activity branch in vertical timelines (layoutTimeline.ts
// runLayoutVertTimeline) offsets the activity axis from the milestone's edge
// by two fixed 24px gutters (one to the branch axis, one from the branch axis
// to the activity), i.e. 48px total — not CROSS_GAP (14px), which is reserved
// for the along-timeline (vertical) stacking gap.
const VERT_BRANCH_GUTTER = 48;

/**
 * Computes {x, y} coordinates for a selection of blocks arranged on a timeline.
 */
export function computeTimelineLayout(
  orderedIds: BlockId[],
  startX: number,
  startY: number,
  sizes: Map<BlockId, TimelineLayoutSize>,
  options: TimelineLayoutOptions = {},
): Map<BlockId, TimelineLayoutPoint> {
  const out = new Map<BlockId, TimelineLayoutPoint>();
  if (orderedIds.length === 0) {
    return out;
  }

  const axis = options.axis ?? "horizontal";
  const branchMode = options.branchMode ?? "auto";
  const alongGap = options.alongGap ?? ALONG_GAP;

  const firstId = orderedIds[0];
  const firstSize = sizes.get(firstId) ?? DEFAULT_SIZE;

  if (axis === "horizontal") {
    const railCenterY = startY + firstSize.h / 2;
    out.set(firstId, { x: startX, y: startY });

    let currentX = startX + firstSize.w + alongGap;

    for (let i = 1; i < orderedIds.length; i += 1) {
      const blockId = orderedIds[i];
      const blockSize = sizes.get(blockId) ?? DEFAULT_SIZE;

      let blockY = railCenterY - blockSize.h / 2;
      if (branchMode === "alternate") {
        const isTop = (i - 1) % 2 === 0;
        blockY = isTop
          ? railCenterY - alongGap - blockSize.h
          : railCenterY + alongGap;
      } else if (branchMode === "one-side") {
        blockY = railCenterY - alongGap - blockSize.h;
      } else if (branchMode === "one-side-reverse") {
        blockY = railCenterY + alongGap;
      }

      out.set(blockId, { x: currentX, y: blockY });
      currentX += blockSize.w + alongGap;
    }
  } else {
    const railCenterX = startX + firstSize.w / 2;
    out.set(firstId, { x: startX, y: startY });

    let currentY = startY + firstSize.h + alongGap;

    for (let i = 1; i < orderedIds.length; i += 1) {
      const blockId = orderedIds[i];
      const blockSize = sizes.get(blockId) ?? DEFAULT_SIZE;
      const isLeft = branchMode === "alternate"
        ? (i - 1) % 2 === 0
        : branchMode === "one-side-reverse" ? false : true;
      const branchX = isLeft
        ? railCenterX - blockSize.w - alongGap
        : railCenterX + alongGap;

      out.set(blockId, { x: branchX, y: currentY });
      currentY += blockSize.h + alongGap;
    }
  }

  return out;
}

/**
 * Computes {x, y} coordinates for a hierarchical tree-structured timeline.
 * Root is the origin milestone, direct children are milestones along the axis,
 * and subsequent descendants are milestone activity ladders.
 */
export function computeTimelineTreeLayout(
  rootId: BlockId,
  rootX: number,
  rootY: number,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TimelineLayoutSize>,
  options: TimelineTreeLayoutOptions = {},
): Map<BlockId, TimelineLayoutPoint> {
  const out = new Map<BlockId, TimelineLayoutPoint>();
  const rootSize = sizes.get(rootId) ?? DEFAULT_SIZE;
  out.set(rootId, { x: rootX, y: rootY });

  const axis = options.axis ?? "horizontal";
  const alongGap = options.alongGap ?? ALONG_GAP;
  const crossGap = options.crossGap ?? CROSS_GAP;
  const milestones = childrenByParent.get(rootId) ?? [];
  const activityCount = milestones.reduce(
    (count, milestoneId) => count + (childrenByParent.get(milestoneId)?.length ?? 0),
    0,
  );
  const branchMode = options.branchMode === "auto"
    ? activityCount > 3 ? "alternate" : "one-side"
    : options.branchMode ?? "auto";

  if (milestones.length === 0) {
    return out;
  }

  if (axis === "horizontal") {
    const railCenterY = rootY + rootSize.h / 2;
    // Legacy (runHorizontalTimeline) puts the first milestone X_GAP*2 past the
    // root's right edge, and X_GAP*2.5 past each prior milestone's own extent —
    // not the generic alongGap*1.5 used elsewhere in this file.
    const firstMilestoneX = rootX + rootSize.w + alongGap * 2;
    const levelWidths = new Map<number, number>();
    milestones.forEach((milestoneId, index) => {
      collectTimelineLevelWidths(milestoneId, index + 1, childrenByParent, sizes, levelWidths);
    });
    const levelOffsets = computeTimelineLevelOffsets(levelWidths, firstMilestoneX);
    const nextXBySide: [number, number] = [firstMilestoneX, firstMilestoneX];
    let previousX = rootX + rootSize.w;
    let columnShift = 0;

    milestones.forEach((milestoneId, idx) => {
      const mSize = sizes.get(milestoneId) ?? DEFAULT_SIZE;
      const isTop = branchMode === "alternate"
        ? idx % 2 === 0
        : branchMode === "one-side-reverse" ? false : true;

      const milestoneLevel = idx + 1;
      const baseX = levelOffsets.get(milestoneLevel) ?? firstMilestoneX;
      const sideKey = isTop ? 0 : 1;
      const desiredX = baseX + columnShift;
      const milestoneX = Math.max(desiredX, nextXBySide[sideKey], previousX);
      const branchShift = milestoneX - baseX;
      columnShift = Math.max(columnShift, branchShift);
      const branchOffsets = new Map(
        [...levelOffsets].map(([level, offset]) => [level, level >= milestoneLevel ? offset + branchShift : offset]),
      );
      const branchStartIds = new Set(out.keys());

      // Legacy always centers every milestone's Y on the axis line (only its
      // ACTIVITIES branch top/bottom via `isTop`) — this used to offset the
      // milestone box itself off the rail, so the line ran along the box's
      // edge instead of through its middle.
      const mY = railCenterY - mSize.h / 2;

      out.set(milestoneId, { x: milestoneX, y: mY });

      // Layout activity descendants of this milestone (and, recursively,
      // their own descendants) — see layoutTimelineHorizontalMilestoneActivities.
      const branchMaxW = layoutTimelineHorizontalMilestoneActivities(
        milestoneId, mSize, milestoneX, mY, isTop, childrenByParent, sizes,
        alongGap, crossGap, options.descendantStyle === "hierarchy", out, branchOffsets, milestoneLevel,
      );

      const branchRight = [...out].reduce((max, [id, point]) => {
        if (branchStartIds.has(id)) return max;
        const size = sizes.get(id) ?? DEFAULT_SIZE;
        return point.x >= milestoneX ? Math.max(max, point.x + size.w) : max;
      }, milestoneX + branchMaxW);
      previousX = milestoneX + mSize.w;
      nextXBySide[sideKey] = branchRight + alongGap * 2.5;
    });
  } else {
    const railCenterX = rootX + rootSize.w / 2;
    // Legacy (runLayoutVertTimeline) keeps every milestone centered on the
    // single vertical spine — only its ACTIVITIES branch left/right — and
    // spaces milestones along Y using Y_GAP (crossGap here), not X_GAP
    // (alongGap): Y_GAP*2 past the root, Y_GAP*3 past each prior milestone.
    let cursorY = rootY + rootSize.h + crossGap * 2;

    milestones.forEach((milestoneId, idx) => {
      const mSize = sizes.get(milestoneId) ?? DEFAULT_SIZE;
      const isLeft = branchMode === "alternate"
        ? idx % 2 === 0
        : branchMode === "one-side-reverse" ? false : true;

      const mX = railCenterX - mSize.w / 2;

      out.set(milestoneId, { x: mX, y: cursorY });

      const activities = childrenByParent.get(milestoneId) ?? [];
      let branchBottom = cursorY + mSize.h;
      let activityY = branchBottom + VERT_TIMELINE_GAP;
      const branchSide: -1 | 1 = isLeft ? -1 : 1;

      for (const actId of activities) {
        const actSize = sizes.get(actId) ?? DEFAULT_SIZE;
        const actPoint = isLeft
          ? { x: mX - VERT_BRANCH_GUTTER - actSize.w, y: activityY }
          : { x: mX + mSize.w + VERT_BRANCH_GUTTER, y: activityY };
        out.set(actId, actPoint);
        // "tree" is the ladder/fanout style (layoutTimelineVerticalDescendants,
        // matches legacy's layoutVertTimelineDescendants); "hierarchy" is the
        // centered bracket style (layoutTimelineHierarchyDescendants, matches
        // legacy's layoutHierarchyDescendants). These were swapped: hierarchy
        // used the ladder and tree fell through with no recursion at all,
        // silently freezing every level-3+ descendant in its stale position.
        const actBottom = options.descendantStyle === "hierarchy"
          ? layoutTimelineHierarchyDescendants(actId, actPoint, childrenByParent, sizes, "vertical", out, branchSide)
          : layoutTimelineVerticalDescendants(actId, actPoint, childrenByParent, sizes, branchSide, out);
        branchBottom = Math.max(branchBottom, actBottom);
        activityY = branchBottom + VERT_TIMELINE_GAP;
      }

      cursorY = branchBottom + crossGap * 3;
    });
  }

  return out;
}

/**
 * Computes connection specifications for timeline arrangements.
 */
export function computeTimelineConnections(
  orderedIds: BlockId[],
  lineType: "straight" | "orthogonal" | "curved" = "straight",
): TimelineConnectionSpec[] {
  const connections: TimelineConnectionSpec[] = [];
  for (let i = 0; i < orderedIds.length - 1; i++) {
    connections.push({
      id: `${orderedIds[i]}-${orderedIds[i + 1]}`,
      fromBlockId: orderedIds[i],
      toBlockId: orderedIds[i + 1],
      lineType,
      role: "rail",
    });
  }
  return connections;
}
