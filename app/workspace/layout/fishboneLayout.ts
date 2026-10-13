/**
 * Pure fishbone auto-arrange layout (no React/store dependencies).
 * See CONTRACTS.md §30 — ports the old app's fishbone family
 * (app/mindmap/hooks/layouts/layoutFishbone.ts, fishboneSlots.ts,
 * fishboneFootprint.ts, fishboneEdges.ts).
 *
 * Geometry & Semantics:
 * 1. Central spine line extending horizontally from root (spineId).
 * 2. Primary categories branching alternately above (top, -1) and below (bottom, +1)
 *    the spine line with Category Spine Gap and dynamic category footprints.
 * 3. Multi-level cause/sub-cause ladders placed in depth-staggered columns.
 * 4. Connection semantics: spine backbone, category entries, and diagonal ribs
 *    with horizontal wire ticks into cause nodes.
 */

import type { BlockId } from "../types/block";
import { ALONG_GAP } from "./treeLayout";
import {
  getFishboneCategoryFootprint,
  getFishboneDescendantColumnX,
  getFishboneSpinePositions,
  resolveFishboneSlots,
  type FishboneMode,
} from "./fishboneFootprint";

export const CATEGORY_X_OFFSET = 48;
export const CATEGORY_SPINE_GAP = 72;
export const PAIR_SPACING = 320;
export const SIBLING_GAP = 14;
export const CONNECTOR_GUTTER = 18;
export const RIB_MIN_TICK = 12;
/** Vertical clearance from a descendant node's edge to the next ladder row. */
export const TREE_VERTICAL_GAP = 18;

export interface FishboneLayoutSize {
  w: number;
  h: number;
}

export interface FishboneLayoutPoint {
  x: number;
  y: number;
}

export interface FishboneLayoutOptions {
  spineGap?: number;
  alongGap?: number;
  pairSpacing?: number;
}

export interface FishboneTreeLayoutOptions extends FishboneLayoutOptions {
  mode?: "outward" | "nested";
  capturedSlots?: ReadonlyMap<BlockId, number>;
}

export interface FishboneConnectionSpec {
  id: string;
  fromBlockId: BlockId;
  toBlockId: BlockId;
  d?: string;
  lineType?: "straight" | "orthogonal" | "curved";
  role?: "backbone" | "category-entry" | "diagonal-rib" | "tick";
}

const DEFAULT_SIZE: FishboneLayoutSize = { w: 160, h: 80 };

/**
 * Computes {x, y} coordinates for flat selection fishbone arrange.
 */
export function computeFishboneLayout(
  spineId: BlockId,
  ribIds: BlockId[],
  spineX: number,
  spineY: number,
  sizes: Map<BlockId, FishboneLayoutSize>,
  options: FishboneLayoutOptions = {},
): Map<BlockId, FishboneLayoutPoint> {
  const out = new Map<BlockId, FishboneLayoutPoint>();
  out.set(spineId, { x: spineX, y: spineY });

  const cleanRibIds = ribIds.filter((id) => id !== spineId);
  if (cleanRibIds.length === 0) {
    return out;
  }

  const spineGap = options.spineGap ?? CATEGORY_SPINE_GAP;
  const alongGap = options.alongGap ?? ALONG_GAP;

  const spineSize = sizes.get(spineId) ?? DEFAULT_SIZE;
  const spineCenterY = spineY + spineSize.h / 2;
  const spineRightEdge = spineX + spineSize.w;

  let currentPairX = spineRightEdge + CATEGORY_X_OFFSET;
  const pairCount = Math.ceil(cleanRibIds.length / 2);

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const topRibId = cleanRibIds[pairIndex * 2];
    const bottomRibId = cleanRibIds[pairIndex * 2 + 1];

    const topSize = topRibId ? (sizes.get(topRibId) ?? DEFAULT_SIZE) : DEFAULT_SIZE;
    const bottomSize = bottomRibId ? (sizes.get(bottomRibId) ?? DEFAULT_SIZE) : DEFAULT_SIZE;

    const pairWidth = Math.max(
      topRibId ? topSize.w : 0,
      bottomRibId ? bottomSize.w : 0,
    );

    if (topRibId) {
      const topY = spineCenterY - spineGap - topSize.h;
      out.set(topRibId, { x: currentPairX, y: topY });
    }

    if (bottomRibId) {
      const bottomY = spineCenterY + spineGap;
      out.set(bottomRibId, { x: currentPairX, y: bottomY });
    }

    currentPairX += pairWidth + alongGap;
  }

  return out;
}

function subtreeOutwardSpan(
  id: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, FishboneLayoutSize>,
): number {
  const size = sizes.get(id) ?? DEFAULT_SIZE;
  const children = childrenByParent.get(id) ?? [];
  if (children.length <= 1) return size.h;
  const childrenSpan = children.reduce(
    (sum, childId) => sum + subtreeOutwardSpan(childId, childrenByParent, sizes),
    0,
  ) + (children.length - 1) * SIBLING_GAP;
  return Math.max(size.h, childrenSpan);
}

function layoutDescendants(
  id: BlockId,
  originX: number,
  parentX: number,
  parentY: number,
  parentW: number,
  parentH: number,
  direction: 1 | -1,
  depth: number,
  mode: FishboneMode,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, FishboneLayoutSize>,
  out: Map<BlockId, FishboneLayoutPoint>,
  outerGap: number = TREE_VERTICAL_GAP,
) {
  const children = childrenByParent.get(id) ?? [];
  if (children.length === 0) return;

  const ladderStartX = getFishboneDescendantColumnX(
    originX,
    depth,
    mode,
    parentX + parentW,
    CONNECTOR_GUTTER,
  );
  const ladderBaseEdgeY = parentY + (direction === 1 ? parentH + outerGap : -outerGap);
  let cursorEdgeY = ladderBaseEdgeY;

  for (const childId of children) {
    const childSize = sizes.get(childId) ?? DEFAULT_SIZE;
    const childSpan = subtreeOutwardSpan(childId, childrenByParent, sizes);
    const childX = ladderStartX;
    const childY = direction === 1 ? cursorEdgeY : cursorEdgeY - childSize.h;

    out.set(childId, { x: childX, y: childY });
    cursorEdgeY += direction * (childSpan + SIBLING_GAP);

    layoutDescendants(
      childId,
      originX,
      childX,
      childY,
      childSize.w,
      childSize.h,
      direction,
      depth + 1,
      mode,
      childrenByParent,
      sizes,
      out,
      TREE_VERTICAL_GAP,
    );
  }
}

/**
 * Computes {x, y} coordinates for a hierarchical tree fishbone layout.
 */
export function computeFishboneTreeLayout(
  rootId: BlockId,
  rootX: number,
  rootY: number,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, FishboneLayoutSize>,
  options: FishboneTreeLayoutOptions = {},
): Map<BlockId, FishboneLayoutPoint> {
  const out = new Map<BlockId, FishboneLayoutPoint>();
  const rootSize = sizes.get(rootId) ?? DEFAULT_SIZE;
  out.set(rootId, { x: rootX, y: rootY });

  const categories = childrenByParent.get(rootId) ?? [];
  if (categories.length === 0) {
    return out;
  }

  const mode = options.mode ?? "outward";
  const spineGap = options.spineGap ?? CATEGORY_SPINE_GAP;
  const pairSpacing = options.pairSpacing ?? PAIR_SPACING;
  const spineY = rootY + rootSize.h / 2;
  const spineStartX = rootX + rootSize.w;

  const pairFootprints = new Map<number, Partial<Record<1 | -1, { width: number; branching: boolean }>>>();
  const categorySlots = resolveFishboneSlots(
    categories,
    (categoryId) => subtreeOutwardSpan(categoryId, childrenByParent, sizes),
    options.capturedSlots,
  );
  categories.forEach((childId, index) => {
    const slot = categorySlots.get(childId) ?? index;
    const pairIndex = Math.floor(slot / 2);
    const direction: 1 | -1 = slot % 2 === 0 ? -1 : 1;
    const footprint = getFishboneCategoryFootprint(childId, childrenByParent, sizes, {
      mode,
      connectorGutter: CONNECTOR_GUTTER,
    });
    const footprints = pairFootprints.get(pairIndex) ?? {};
    footprints[direction] = footprint;
    pairFootprints.set(pairIndex, footprints);
  });

  const spineXByPair = getFishboneSpinePositions(pairFootprints, spineStartX, ALONG_GAP, pairSpacing);

  categories.forEach((catId, index) => {
    const catSize = sizes.get(catId) ?? DEFAULT_SIZE;
    const slot = categorySlots.get(catId) ?? index;
    const direction: 1 | -1 = slot % 2 === 0 ? -1 : 1;
    const pairIndex = Math.floor(slot / 2);
    const spineX = spineXByPair.get(pairIndex) ?? (spineStartX + ALONG_GAP + pairIndex * pairSpacing);

    const childX = spineX + CATEGORY_X_OFFSET;
    const childY = direction === -1
      ? spineY - spineGap - catSize.h
      : spineY + spineGap;

    out.set(catId, { x: childX, y: childY });

    const boneStepX = mode === "nested" ? 76 : 104;
    const descendantStep = mode === "nested" ? 188 : 206;
    const firstDescendantX = childX + catSize.w + boneStepX + 24;
    layoutDescendants(
      catId,
      firstDescendantX - descendantStep,
      childX,
      childY,
      catSize.w,
      catSize.h,
      direction,
      1,
      mode,
      childrenByParent,
      sizes,
      out,
      CATEGORY_SPINE_GAP / 2,
    );
  });

  return out;
}

/**
 * Computes connection specs for fishbone tree relationships.
 */
export function computeFishboneConnections(
  spineId: BlockId,
  ribIds: BlockId[],
  lineType: "straight" | "orthogonal" = "straight",
): FishboneConnectionSpec[] {
  const connections: FishboneConnectionSpec[] = [];
  for (const ribId of ribIds) {
    if (ribId === spineId) continue;
    connections.push({
      id: `${spineId}-${ribId}`,
      fromBlockId: spineId,
      toBlockId: ribId,
      lineType,
      role: "category-entry",
    });
  }
  return connections;
}
