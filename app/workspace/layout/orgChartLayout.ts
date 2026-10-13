/**
 * Pure org-chart auto-arrange layout (no React/store dependencies).
 * See CONTRACTS.md §58 — ports the old app's "org-chart" layout family
 * (app/mindmap/hooks/layouts/layoutOrgChart.ts's runLayoutOrg, computeOrgLevelHeights,
 * and computeOrgLevelOffsets).
 *
 * Key structural characteristics:
 * 1. Growth axis is downward (top-to-bottom).
 * 2. Row-banding: every node at depth N shares a horizontal row band whose
 *    height is the tallest node at that depth across the entire tree.
 * 3. Nodes are vertically centered within their depth band.
 * 4. Successive row bands are separated by ORG_ROW_GAP (42px = Y_GAP * 3).
 * 5. Sibling subtrees are separated horizontally by ORG_SIBLING_GAP (65px = X_GAP)
 *    and centered under their parent.
 * 6. Connection semantics: curved bezier (from bottom-center to top-center) or orthogonal bus links.
 */

import type { BlockId } from "../types/block";
import type { TreeLayoutPoint, TreeLayoutSize } from "./treeLayout";

export const ORG_SIBLING_GAP = 65;
export const ORG_ROW_GAP = 42;
const DEFAULT_SIZE: TreeLayoutSize = { w: 160, h: 80 };

export interface OrgChartLayoutOptions {
  rowGap?: number;
  siblingGap?: number;
}

export interface OrgChartConnectionSpec {
  id: string;
  fromBlockId: BlockId;
  toBlockId: BlockId;
  fromSide: "bottom";
  toSide: "top";
  lineType: "curved" | "orthogonal";
}

interface RowBand {
  top: number;
  center: number;
  height: number;
}

function measureDepthHeights(
  nodeId: BlockId,
  depth: number,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TreeLayoutSize>,
  depthHeights: Map<number, number>,
  visited: Set<BlockId>,
): void {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  const size = sizes.get(nodeId) ?? DEFAULT_SIZE;
  const currentMax = depthHeights.get(depth) ?? 0;
  if (size.h > currentMax) {
    depthHeights.set(depth, size.h);
  }

  const children = childrenByParent.get(nodeId) ?? [];
  for (const childId of children) {
    measureDepthHeights(childId, depth + 1, childrenByParent, sizes, depthHeights, visited);
  }
}

function computeDepthOffsets(
  depthHeights: Map<number, number>,
  startY: number,
  rowGap: number,
): Map<number, RowBand> {
  const offsets = new Map<number, RowBand>();
  let cursor = startY;

  const sortedDepths = Array.from(depthHeights.keys()).sort((a, b) => a - b);
  for (const depth of sortedDepths) {
    const height = depthHeights.get(depth) ?? DEFAULT_SIZE.h;
    offsets.set(depth, {
      top: cursor,
      center: cursor + height / 2,
      height,
    });
    cursor += height + rowGap;
  }

  return offsets;
}

function computeSubtreeWidths(
  nodeId: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TreeLayoutSize>,
  subtreeWidths: Map<BlockId, number>,
  siblingGap: number,
  visited: Set<BlockId>,
): number {
  if (visited.has(nodeId)) {
    return subtreeWidths.get(nodeId) ?? (sizes.get(nodeId)?.w ?? DEFAULT_SIZE.w);
  }
  visited.add(nodeId);

  const size = sizes.get(nodeId) ?? DEFAULT_SIZE;
  const children = childrenByParent.get(nodeId) ?? [];
  if (children.length === 0) {
    subtreeWidths.set(nodeId, size.w);
    return size.w;
  }

  let childrenTotalW = 0;
  for (const childId of children) {
    childrenTotalW += computeSubtreeWidths(childId, childrenByParent, sizes, subtreeWidths, siblingGap, visited);
  }
  childrenTotalW += Math.max(0, children.length - 1) * siblingGap;

  const ownSubtreeW = Math.max(size.w, childrenTotalW);
  subtreeWidths.set(nodeId, ownSubtreeW);
  return ownSubtreeW;
}

function layoutNode(
  nodeId: BlockId,
  depth: number,
  crossStart: number,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TreeLayoutSize>,
  subtreeWidths: Map<BlockId, number>,
  depthOffsets: Map<number, RowBand>,
  siblingGap: number,
  result: Map<BlockId, TreeLayoutPoint>,
  visited: Set<BlockId>,
): void {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  const size = sizes.get(nodeId) ?? DEFAULT_SIZE;
  const totalSubtreeW = subtreeWidths.get(nodeId) ?? size.w;
  const centerX = crossStart + totalSubtreeW / 2;
  const x = centerX - size.w / 2;

  const rowInfo = depthOffsets.get(depth);
  const y = rowInfo ? rowInfo.center - size.h / 2 : 0;

  result.set(nodeId, { x, y });

  const children = childrenByParent.get(nodeId) ?? [];
  if (children.length === 0) return;

  const childrenTotalW = children.reduce(
    (sum, childId) => sum + (subtreeWidths.get(childId) ?? (sizes.get(childId)?.w ?? DEFAULT_SIZE.w)),
    0,
  ) + Math.max(0, children.length - 1) * siblingGap;

  let childCrossStart = crossStart + Math.max(0, (totalSubtreeW - childrenTotalW) / 2);

  for (const childId of children) {
    const childSubtreeW = subtreeWidths.get(childId) ?? (sizes.get(childId)?.w ?? DEFAULT_SIZE.w);
    layoutNode(
      childId,
      depth + 1,
      childCrossStart,
      childrenByParent,
      sizes,
      subtreeWidths,
      depthOffsets,
      siblingGap,
      result,
      visited,
    );
    childCrossStart += childSubtreeW + siblingGap;
  }
}

/**
 * Computes {x, y} (top-left, matching Transform) for `rootId` and every
 * descendant reachable through `childrenByParent`, organizing nodes into
 * an org-chart layout with depth-banded Y rows and horizontally-centered
 * child subtrees.
 */
export function computeOrgChartLayout(
  rootId: BlockId,
  rootX: number,
  rootY: number,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TreeLayoutSize>,
  options: OrgChartLayoutOptions = {},
): Map<BlockId, TreeLayoutPoint> {
  const rowGap = options.rowGap ?? ORG_ROW_GAP;
  const siblingGap = options.siblingGap ?? ORG_SIBLING_GAP;

  const depthHeights = new Map<number, number>();
  measureDepthHeights(rootId, 0, childrenByParent, sizes, depthHeights, new Set());

  const depthOffsets = computeDepthOffsets(depthHeights, rootY, rowGap);

  const subtreeWidths = new Map<BlockId, number>();
  const totalRootW = computeSubtreeWidths(rootId, childrenByParent, sizes, subtreeWidths, siblingGap, new Set());

  const rootSize = sizes.get(rootId) ?? DEFAULT_SIZE;
  const rootCenterX = rootX + rootSize.w / 2;
  const startCross = rootCenterX - totalRootW / 2;

  const result = new Map<BlockId, TreeLayoutPoint>();
  layoutNode(
    rootId,
    0,
    startCross,
    childrenByParent,
    sizes,
    subtreeWidths,
    depthOffsets,
    siblingGap,
    result,
    new Set(),
  );

  return result;
}

/**
 * Computes connector specifications for an org-chart hierarchy.
 */
export function computeOrgChartConnections(
  rootId: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
  lineType: "curved" | "orthogonal" = "curved",
): OrgChartConnectionSpec[] {
  const connections: OrgChartConnectionSpec[] = [];
  const visited = new Set<BlockId>();

  function walk(parentId: BlockId) {
    if (visited.has(parentId)) return;
    visited.add(parentId);

    const children = childrenByParent.get(parentId) ?? [];
    for (const childId of children) {
      connections.push({
        id: `${parentId}-${childId}`,
        fromBlockId: parentId,
        toBlockId: childId,
        fromSide: "bottom",
        toSide: "top",
        lineType,
      });
      walk(childId);
    }
  }

  walk(rootId);
  return connections;
}
