/**
 * Pure flowchart auto-arrange layout (no React/store dependencies).
 * See CONTRACTS.md §35 — ports the old app's flowchart family
 * (app/mindmap/hooks/layouts/layoutFlowchartAdapters.ts, layoutFlowchart.ts).
 *
 * Geometry & Semantics:
 * 1. Flat selection flowchart:
 *    - Vertical ("down") or horizontal ("right") sequential pipeline anchored at (startX, startY).
 *    - Aligns blocks along the central flow axis (centered on the widest/tallest block).
 * 2. Tree/branching flowchart:
 *    - Depth-ranked columns where decision branches split and recombine.
 *    - Subtrees are balanced and centered across their respective rank spans.
 * 3. Connection semantics:
 *    - Orthogonal elbow connectors ("orthogonal" lineType) with end arrows.
 */

import type { BlockId } from "../types/block";
import { ALONG_GAP, CROSS_GAP } from "./treeLayout";

export type FlowchartDirection = "down" | "right";
export type FlowchartAlign = "center" | "start";

export interface FlowchartLayoutSize {
  w: number;
  h: number;
}

export interface FlowchartLayoutPoint {
  x: number;
  y: number;
}

export interface FlowchartLayoutOptions {
  direction?: FlowchartDirection;
  align?: FlowchartAlign;
  alongGap?: number;
  crossGap?: number;
}

export interface FlowchartTreeLayoutOptions extends FlowchartLayoutOptions {
  columnGap?: number;
  rowGap?: number;
}

export interface FlowchartConnectionSpec {
  id: string;
  fromBlockId: BlockId;
  toBlockId: BlockId;
  lineType: "orthogonal" | "straight";
  arrowEnd?: boolean;
}

const DEFAULT_SIZE: FlowchartLayoutSize = { w: 160, h: 80 };

/**
 * Computes {x, y} coordinates for a flowchart sequence anchored at (startX, startY).
 */
export function computeFlowchartLayout(
  orderedIds: BlockId[],
  startX: number,
  startY: number,
  sizes: Map<BlockId, FlowchartLayoutSize>,
  options: FlowchartLayoutOptions = {},
): Map<BlockId, FlowchartLayoutPoint> {
  const out = new Map<BlockId, FlowchartLayoutPoint>();
  if (orderedIds.length === 0) {
    return out;
  }

  const direction = options.direction ?? "down";
  const align = options.align ?? "center";
  const alongGap = options.alongGap ?? ALONG_GAP;

  const firstId = orderedIds[0];
  const firstSize = sizes.get(firstId) ?? DEFAULT_SIZE;

  if (direction === "down") {
    let maxW = firstSize.w;
    for (const id of orderedIds) {
      const s = sizes.get(id) ?? DEFAULT_SIZE;
      if (s.w > maxW) maxW = s.w;
    }
    const centerX = startX + (align === "center" ? maxW / 2 : firstSize.w / 2);

    let currentY = startY;
    for (const blockId of orderedIds) {
      const blockSize = sizes.get(blockId) ?? DEFAULT_SIZE;
      const x = align === "center" ? centerX - blockSize.w / 2 : startX;
      out.set(blockId, { x, y: currentY });
      currentY += blockSize.h + alongGap;
    }
  } else {
    // Horizontal flowchart ("right")
    let maxH = firstSize.h;
    for (const id of orderedIds) {
      const s = sizes.get(id) ?? DEFAULT_SIZE;
      if (s.h > maxH) maxH = s.h;
    }
    const centerY = startY + (align === "center" ? maxH / 2 : firstSize.h / 2);

    let currentX = startX;
    for (const blockId of orderedIds) {
      const blockSize = sizes.get(blockId) ?? DEFAULT_SIZE;
      const y = align === "center" ? centerY - blockSize.h / 2 : startY;
      out.set(blockId, { x: currentX, y });
      currentX += blockSize.w + alongGap;
    }
  }

  return out;
}

/**
 * Computes {x, y} coordinates for a branching tree flowchart.
 * Ranks nodes by depth level, computing subtree spans to center branching nodes.
 */
export function computeFlowchartTreeLayout(
  rootId: BlockId,
  rootX: number,
  rootY: number,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, FlowchartLayoutSize>,
  options: FlowchartTreeLayoutOptions = {},
): Map<BlockId, FlowchartLayoutPoint> {
  const out = new Map<BlockId, FlowchartLayoutPoint>();
  const columnGap = options.columnGap ?? (ALONG_GAP * 1.5);
  const rowGap = options.rowGap ?? (CROSS_GAP * 1.5);
  const direction = options.direction ?? "right";

  const subtreeSpans = new Map<BlockId, number>();

  function calcSpan(id: BlockId): number {
    const size = sizes.get(id) ?? DEFAULT_SIZE;
    const ownSpan = direction === "right" ? size.h : size.w;
    const children = childrenByParent.get(id) ?? [];
    if (children.length === 0) {
      subtreeSpans.set(id, ownSpan);
      return ownSpan;
    }
    const childrenSpan = children.reduce((sum, childId) => sum + calcSpan(childId), 0)
      + (children.length - 1) * rowGap;
    const span = Math.max(ownSpan, childrenSpan);
    subtreeSpans.set(id, span);
    return span;
  }

  calcSpan(rootId);

  const maxAlongByLevel: number[] = [];

  function collectLevels(id: BlockId, depth: number) {
    const size = sizes.get(id) ?? DEFAULT_SIZE;
    const alongSize = direction === "right" ? size.w : size.h;
    maxAlongByLevel[depth] = Math.max(maxAlongByLevel[depth] ?? 0, alongSize);
    const children = childrenByParent.get(id) ?? [];
    for (const childId of children) {
      collectLevels(childId, depth + 1);
    }
  }

  collectLevels(rootId, 0);

  const levelAlongOffsets: number[] = [direction === "right" ? rootX : rootY];
  for (let lvl = 1; lvl < maxAlongByLevel.length; lvl++) {
    levelAlongOffsets[lvl] = levelAlongOffsets[lvl - 1] + maxAlongByLevel[lvl - 1] + columnGap;
  }

  function layoutSubtree(id: BlockId, depth: number, crossStart: number) {
    const size = sizes.get(id) ?? DEFAULT_SIZE;
    const totalSpan = subtreeSpans.get(id) ?? (direction === "right" ? size.h : size.w);
    const alongPos = levelAlongOffsets[depth];

    if (direction === "right") {
      const y = crossStart + (totalSpan - size.h) / 2;
      out.set(id, { x: alongPos, y });

      const children = childrenByParent.get(id) ?? [];
      let childCross = crossStart;
      for (const childId of children) {
        const childSpan = subtreeSpans.get(childId) ?? DEFAULT_SIZE.h;
        layoutSubtree(childId, depth + 1, childCross);
        childCross += childSpan + rowGap;
      }
    } else {
      const x = crossStart + (totalSpan - size.w) / 2;
      out.set(id, { x, y: alongPos });

      const children = childrenByParent.get(id) ?? [];
      let childCross = crossStart;
      for (const childId of children) {
        const childSpan = subtreeSpans.get(childId) ?? DEFAULT_SIZE.w;
        layoutSubtree(childId, depth + 1, childCross);
        childCross += childSpan + rowGap;
      }
    }
  }

  const initialCross = direction === "right" ? rootY : rootX;
  layoutSubtree(rootId, 0, initialCross);

  return out;
}

/**
 * Computes orthogonal connection specifications between consecutive flowchart blocks.
 */
export function computeFlowchartConnections(
  orderedIds: BlockId[],
  lineType: "orthogonal" | "straight" = "orthogonal",
): FlowchartConnectionSpec[] {
  const connections: FlowchartConnectionSpec[] = [];
  for (let i = 0; i < orderedIds.length - 1; i++) {
    connections.push({
      id: `${orderedIds[i]}-${orderedIds[i + 1]}`,
      fromBlockId: orderedIds[i],
      toBlockId: orderedIds[i + 1],
      lineType,
      arrowEnd: true,
    });
  }
  return connections;
}
