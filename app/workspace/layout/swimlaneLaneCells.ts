import type { BlockId } from "../types/block";

/**
 * The swimlane primitives shared by the layout pass and the band chrome, split
 * out so neither has to import the other.
 */
export type SwimlaneOrientation = "horizontal" | "vertical";

export interface SwimlaneLayoutSize {
  w: number;
  h: number;
}

export const DEFAULT_SWIMLANE_SIZE: SwimlaneLayoutSize = { w: 160, h: 80 };
/** Padding between a band's edge and the nodes inside it. */
export const DEFAULT_BAND_PADDING = 16;

/** The direct children that act as lanes, applying legacy's auto-unwrap. */
export function resolveSwimlaneLaneIds(
  rootId: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
): BlockId[] {
  const children = childrenByParent.get(rootId) ?? [];
  if (children.length === 1) {
    const grandchildren = childrenByParent.get(children[0]) ?? [];
    if (grandchildren.length >= 2) return grandchildren;
  }
  return children;
}

/** A lane and its steps, in flow order: the lane node itself is slot 0. */
export function collectLaneChain(
  laneId: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
): BlockId[] {
  const chain: BlockId[] = [];
  const visit = (id: BlockId) => {
    chain.push(id);
    for (const childId of childrenByParent.get(id) ?? []) visit(childId);
  };
  visit(laneId);
  return chain;
}

/**
 * A lane's thickness across the flow axis: its tallest (or widest) STEP.
 *
 * Reserving it before positioning anything matters - computing it while
 * placing nodes centres each node on a stale thickness, so a long-content node
 * grows into the next lane (legacy hit exactly this).
 *
 * The lane header is excluded on purpose. It is sized TO the row it labels, so
 * measuring it would feed each arrange's output back into the next one and the
 * row would grow by the padding every time.
 */
export function laneChainThickness(
  chain: BlockId[],
  sizeOf: (id: BlockId) => SwimlaneLayoutSize,
  orientation: SwimlaneOrientation,
): number {
  let thickness = 0;
  for (const id of chain.slice(1)) {
    const size = sizeOf(id);
    thickness = Math.max(thickness, orientation === "horizontal" ? size.h : size.w);
  }
  return thickness || (orientation === "horizontal" ? DEFAULT_SWIMLANE_SIZE.h : DEFAULT_SWIMLANE_SIZE.w);
}

export function laneCellSize(
  headerExtent: number,
  bandThickness: number,
  orientation: SwimlaneOrientation,
): SwimlaneLayoutSize {
  return orientation === "horizontal"
    ? { w: headerExtent, h: bandThickness }
    : { w: bandThickness, h: headerExtent };
}

/**
 * The lane-header cell sizes alone, for the commit pass that has the layout's
 * positions but needs the sizes too. Same numbers computeSwimlaneLayout
 * produces, from the same two helpers, so the two cannot drift.
 */
export function computeSwimlaneLaneCells(
  rootId: BlockId,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, SwimlaneLayoutSize>,
  orientation: SwimlaneOrientation,
  bandPadding = DEFAULT_BAND_PADDING,
): Map<BlockId, SwimlaneLayoutSize> {
  const laneIds = resolveSwimlaneLaneIds(rootId, childrenByParent);
  if (laneIds.length === 0) return new Map();
  const sizeOf = (id: BlockId) => sizes.get(id) ?? DEFAULT_SWIMLANE_SIZE;
  const headerExtent = Math.max(
    ...laneIds.map((laneId) => {
      const size = sizeOf(laneId);
      return orientation === "horizontal" ? size.w : size.h;
    }),
  );

  const out = new Map<BlockId, SwimlaneLayoutSize>();
  for (const laneId of laneIds) {
    const chain = collectLaneChain(laneId, childrenByParent);
    const thickness = laneChainThickness(chain, sizeOf, orientation) + bandPadding * 2;
    out.set(laneId, laneCellSize(headerExtent, thickness, orientation));
  }
  return out;
}
