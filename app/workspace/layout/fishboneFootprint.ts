import type { BlockId } from "../types/block";
import type { FishboneLayoutSize } from "./fishboneLayout";

export type FishboneMode = "outward" | "nested";
export type FishboneDirection = 1 | -1;

export interface FishboneCategoryFootprint {
  width: number;
  branching: boolean;
}

export interface FishboneCapturedSlotGeometry {
  rootWidth: number;
  xGap: number;
  pairSpacing: number;
  categoryXOffset: number;
}

const MAX_CONSECUTIVE_AUTO_SIDE_SLOTS = 3;

/**
 * Reads the slot encoded by an existing legacy-style fishbone placement.
 * `null` means the coordinate is not close enough to a valid pair slot.
 */
export function captureFishboneSlots(
  rootId: BlockId,
  categoryIds: readonly BlockId[],
  positions: ReadonlyMap<BlockId, { x: number; y: number }>,
  geometry: FishboneCapturedSlotGeometry,
): Map<BlockId, number> {
  const root = positions.get(rootId);
  if (!root) return new Map();

  const firstSpineX = root.x + geometry.rootWidth + geometry.xGap;
  const slots = new Map<BlockId, number>();
  const used = new Set<number>();
  for (const categoryId of categoryIds) {
    const child = positions.get(categoryId);
    if (!child) continue;
    const pairIndex = Math.round(
      (child.x - geometry.categoryXOffset - firstSpineX) / geometry.pairSpacing,
    );
    if (pairIndex < 0) continue;
    const slot = pairIndex * 2 + (child.y < root.y ? 0 : 1);
    if (used.has(slot)) continue;
    slots.set(categoryId, slot);
    used.add(slot);
  }
  return slots;
}

/** Matches the legacy fishbone slot resolver's footprint-aware alternation. */
export function resolveFishboneSlots(
  categoryIds: readonly BlockId[],
  weightForCategory: (categoryId: BlockId) => number,
  capturedSlots?: ReadonlyMap<BlockId, number>,
): Map<BlockId, number> {
  const slots = new Map<BlockId, number>();
  const used = new Set<number>();
  if (capturedSlots) {
    for (const categoryId of categoryIds) {
      const slot = capturedSlots.get(categoryId);
      if (slot === undefined || used.has(slot)) continue;
      slots.set(categoryId, slot);
      used.add(slot);
    }
  }
  if (slots.size > 0) {
    let nextSlot = 0;
    for (const categoryId of categoryIds) {
      if (slots.has(categoryId)) continue;
      while (used.has(nextSlot)) nextSlot += 1;
      slots.set(categoryId, nextSlot);
      used.add(nextSlot);
    }
    return slots;
  }

  let topWeight = 0;
  let bottomWeight = 0;
  let lastSlot: number | null = null;
  let consecutiveSideSlots = 0;

  for (const categoryId of categoryIds) {
    if (slots.has(categoryId)) continue;
    const preferredSide = topWeight <= bottomWeight ? 0 : 1;
    const lastSide = lastSlot === null ? null : lastSlot % 2;
    const side = lastSide === preferredSide && consecutiveSideSlots >= MAX_CONSECUTIVE_AUTO_SIDE_SLOTS
      ? preferredSide === 0 ? 1 : 0
      : preferredSide;
    let pairIndex: number = lastSlot === null
      ? 0
      : Math.floor(lastSlot / 2) + (lastSlot % 2 === side ? 1 : 0);
    let slot: number = pairIndex * 2 + side;
    while (used.has(slot)) {
      pairIndex += 1;
      slot = pairIndex * 2 + side;
    }

    slots.set(categoryId, slot);
    used.add(slot);
    lastSlot = slot;
    consecutiveSideSlots = side === lastSide ? consecutiveSideSlots + 1 : 1;
    const rawWeight = weightForCategory(categoryId);
    const weight = Number.isFinite(rawWeight) ? Math.max(1, rawWeight) : 1;
    if (side === 0) topWeight += weight;
    else bottomWeight += weight;
  }

  return slots;
}

const DEFAULT_SIZE: FishboneLayoutSize = { w: 160, h: 80 };

function visibleChildren(
  nodeId: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
): BlockId[] {
  return childrenByParent.get(nodeId) ?? [];
}

function hasBranchingDescendant(
  nodeId: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
): boolean {
  const children = visibleChildren(nodeId, childrenByParent);
  if (children.length > 1) return true;
  return children.some((childId) => hasBranchingDescendant(childId, childrenByParent));
}

/**
 * Ladder column X for a descendant `depth` levels below the category's entry
 * row. Mirrors the legacy fixed-pitch ladder (app/mindmap/hooks/layouts/
 * fishboneFootprint.ts): columns sit at a constant step from `originX`
 * (the first descendant column), unless the actual content at `parentRight`
 * needs more room, in which case the column shifts right to clear it. This
 * keeps a straight single-child chain in its own compact lane while letting
 * a wide node push its own children further out.
 */
export function getFishboneDescendantColumnX(
  originX: number,
  depth: number,
  mode: FishboneMode,
  parentRight: number,
  connectorGutter: number,
): number {
  const step = mode === "nested" ? 188 : 206;
  return Math.max(originX + depth * step, parentRight + connectorGutter * 2);
}

function descendantRightEdge(
  nodeId: BlockId,
  x: number,
  originX: number,
  depth: number,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, FishboneLayoutSize>,
  mode: FishboneMode,
  connectorGutter: number,
): number {
  const size = sizes.get(nodeId) ?? DEFAULT_SIZE;
  const nodeRight = x + size.w;
  const childX = getFishboneDescendantColumnX(originX, depth, mode, nodeRight, connectorGutter);

  return visibleChildren(nodeId, childrenByParent).reduce(
    (rightEdge, childId) => Math.max(
      rightEdge,
      descendantRightEdge(childId, childX, originX, depth + 1, childrenByParent, sizes, mode, connectorGutter),
    ),
    nodeRight,
  );
}

export function getFishboneCategoryFootprint(
  nodeId: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, FishboneLayoutSize>,
  options: { mode?: FishboneMode; connectorGutter?: number } = {},
): FishboneCategoryFootprint {
  const mode = options.mode ?? "outward";
  const connectorGutter = options.connectorGutter ?? 18;
  const size = sizes.get(nodeId) ?? DEFAULT_SIZE;
  const boneStep = mode === "nested" ? 76 : 104;
  const firstDescendantX = size.w + boneStep + 24;

  const width = visibleChildren(nodeId, childrenByParent).reduce(
    (edge, childId) => Math.max(
      edge,
      descendantRightEdge(childId, firstDescendantX, firstDescendantX, 1, childrenByParent, sizes, mode, connectorGutter),
    ),
    size.w,
  );

  return {
    width,
    branching: hasBranchingDescendant(nodeId, childrenByParent),
  };
}

export function getFishboneSpinePositions(
  pairFootprints: Map<number, Partial<Record<FishboneDirection, FishboneCategoryFootprint>>>,
  spineStartX: number,
  xGap: number,
  pairSpacing: number,
): Map<number, number> {
  const spineXByPair = new Map<number, number>();
  const laneFrontier: Record<FishboneDirection, number> = { "-1": spineStartX, 1: spineStartX };
  let nextSpineX = spineStartX + xGap;
  const maxCompactReservation = pairSpacing * 3;

  const lastPairIndex = Math.max(-1, ...pairFootprints.keys());
  for (let pairIndex = 0; pairIndex <= lastPairIndex; pairIndex += 1) {
    const pair = pairFootprints.get(pairIndex) ?? {};
    const spineX = ([-1, 1] as const).reduce(
      (required, direction) => {
        const footprint = pair[direction];
        return footprint ? Math.max(required, laneFrontier[direction] + xGap) : required;
      },
      nextSpineX,
    );

    spineXByPair.set(pairIndex, spineX);

    ([-1, 1] as const).forEach((direction) => {
      const footprint = pair[direction];
      if (!footprint) return;
      const skipReservation = !footprint.branching && footprint.width > maxCompactReservation;
      if (!skipReservation) {
        laneFrontier[direction] = Math.max(laneFrontier[direction], spineX + footprint.width);
      }
    });

    nextSpineX = spineX + pairSpacing;
  }

  return spineXByPair;
}
