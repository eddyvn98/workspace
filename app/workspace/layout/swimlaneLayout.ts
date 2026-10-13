/**
 * Pure swimlane layout (no React/store dependencies).
 *
 * Shape of the tree it expects, matching how legacy's layoutSwimlane reads it
 * (components/features/chat/mindmap/hooks/layouts/layoutSwimlane.ts):
 *
 *   root ("Process Title")
 *     lane 1  -> step -> step -> ...
 *     lane 2  -> step -> step -> ...
 *
 * A lane is a direct child of the root and doubles as that lane's header; the
 * steps are its descendant chain. Legacy's auto-unwrap is kept: a root with
 * exactly one child that itself has 2+ children means someone inserted an
 * intermediate "chart" node, so that node's children become the real lanes.
 *
 * Two orientations, because the two references differ:
 *  - "horizontal" (default, Larksuite-style): lanes are bands stacked top to
 *    bottom, steps flow left to right, header column on the left.
 *  - "vertical" (legacy): lanes are columns side by side, steps flow downward,
 *    header row on top.
 *
 * The defining property either way is ONE shared grid for the whole diagram
 * rather than per-lane spacing: step N of every lane lands on the same grid
 * line, so equivalent process stages stay aligned across lanes. A taller (or
 * wider) node reserves that grid slot everywhere. Legacy's comment on
 * rowTopByIndex makes the same point.
 */

import type { BlockId } from "../types/block";
import {
  collectLaneChain,
  computeSwimlaneLaneCells,
  DEFAULT_BAND_PADDING,
  DEFAULT_SWIMLANE_SIZE,
  laneCellSize,
  laneChainThickness,
  resolveSwimlaneLaneIds,
  type SwimlaneLayoutSize,
  type SwimlaneOrientation,
} from "./swimlaneLaneCells";

export { computeSwimlaneLaneCells, resolveSwimlaneLaneIds };
export type { SwimlaneLayoutSize, SwimlaneOrientation };

export interface SwimlaneLayoutPoint {
  x: number;
  y: number;
}

/** One lane's band, for the chrome layer to paint. */
export interface SwimlaneBand {
  laneId: BlockId;
  index: number;
  /** Band rectangle in world coordinates, header included. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the header ends and the steps begin - the divider line. */
  headerExtent: number;
  color: string;
}

export interface SwimlaneLayoutResult {
  positions: Map<BlockId, SwimlaneLayoutPoint>;
  bands: SwimlaneBand[];
  /** Ids treated as lanes, after auto-unwrap. */
  laneIds: BlockId[];
  /** The size each lane header should take to FILL its row, which is how the
   *  reference tool draws a lane label - see computeSwimlaneLaneCells. */
  laneCells: Map<BlockId, SwimlaneLayoutSize>;
}

export interface SwimlaneLayoutOptions {
  orientation?: SwimlaneOrientation;
  laneGap?: number;
  stepGap?: number;
  /** Padding between a band's edge and the nodes inside it. */
  bandPadding?: number;
}

/** Same 8-colour cycle legacy's SvgSwimlaneLayer uses. */
export const SWIMLANE_LANE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ec4899",
  "#8b5cf6", "#06b6d4", "#f43f5e", "#14b8a6",
];

/** Rows touch, the way a table's do. A gap would leave a strip belonging to no
 *  lane at all, and a step dropped in it would have no lane. */
const DEFAULT_LANE_GAP = 0;
const DEFAULT_STEP_GAP = 48;

export function computeSwimlaneLayout(
  rootId: BlockId,
  rootX: number,
  rootY: number,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, SwimlaneLayoutSize>,
  options: SwimlaneLayoutOptions = {},
): SwimlaneLayoutResult {
  const orientation = options.orientation ?? "horizontal";
  const laneGap = options.laneGap ?? DEFAULT_LANE_GAP;
  const stepGap = options.stepGap ?? DEFAULT_STEP_GAP;
  const padding = options.bandPadding ?? DEFAULT_BAND_PADDING;

  const positions = new Map<BlockId, SwimlaneLayoutPoint>();
  const laneIds = resolveSwimlaneLaneIds(rootId, childrenByParent);
  const rootSize = sizes.get(rootId) ?? DEFAULT_SWIMLANE_SIZE;

  if (laneIds.length === 0) {
    positions.set(rootId, { x: rootX, y: rootY });
    return { positions, bands: [], laneIds, laneCells: new Map() };
  }

  const chains = laneIds.map((laneId) => collectLaneChain(laneId, childrenByParent));
  const sizeOf = (id: BlockId) => sizes.get(id) ?? DEFAULT_SWIMLANE_SIZE;

  // The shared grid: slot i's extent is the largest node in slot i across
  // every lane, so the slot lines up in all of them.
  const slotCount = chains.reduce((max, chain) => Math.max(max, chain.length), 0);
  const slotExtent: number[] = [];
  for (let slot = 0; slot < slotCount; slot += 1) {
    let extent = 0;
    for (const chain of chains) {
      const id = chain[slot];
      if (!id) continue;
      const size = sizeOf(id);
      extent = Math.max(extent, orientation === "horizontal" ? size.w : size.h);
    }
    slotExtent[slot] = extent || (orientation === "horizontal" ? DEFAULT_SWIMLANE_SIZE.w : DEFAULT_SWIMLANE_SIZE.h);
  }

  const laneThickness = chains.map((chain) => laneChainThickness(chain, sizeOf, orientation));

  const slotStart: number[] = [];
  let cursor = 0;
  for (let slot = 0; slot < slotCount; slot += 1) {
    slotStart[slot] = cursor;
    cursor += slotExtent[slot] + stepGap;
  }
  const flowSpan = cursor - stepGap;

  // The title always sits ABOVE the lanes, in both orientations, and the
  // lanes begin below it — same arrangement legacy uses (title at y=40, lane
  // headers at 40 + nodeHeight + rowGap). Putting the vertical orientation's
  // lanes to the RIGHT of the title instead made the title's wires detour
  // around the outside of the whole diagram to reach each lane header.
  const alongOrigin = orientation === "horizontal"
    ? rootX
    : rootY + rootSize.h + stepGap;
  const crossOrigin = orientation === "horizontal"
    ? rootY + rootSize.h + stepGap
    : rootX;

  const bands: SwimlaneBand[] = [];
  const laneCells = new Map<BlockId, SwimlaneLayoutSize>();
  let crossCursor = crossOrigin;

  chains.forEach((chain, laneIndex) => {
    const bandThickness = laneThickness[laneIndex] + padding * 2;
    const laneCentre = crossCursor + bandThickness / 2;

    chain.forEach((id, slot) => {
      // Slot 0 is the lane header, and it does not sit IN the row - it IS the
      // row's label cell, filling it edge to edge. That is what the reference
      // tool draws, and it is what makes the label read as vertically centred
      // in the lane without any special-casing: a text block already centres
      // its own content, so a cell-sized header centres the label for free.
      if (slot === 0) {
        laneCells.set(id, laneCellSize(slotExtent[0], bandThickness, orientation));
        positions.set(id, orientation === "horizontal"
          ? { x: alongOrigin, y: crossCursor }
          : { x: crossCursor, y: alongOrigin });
        return;
      }
      const size = sizeOf(id);
      // Centre in the slot along the flow axis, and on the lane's centre
      // line across it.
      const alongCentre = alongOrigin + slotStart[slot] + slotExtent[slot] / 2;
      if (orientation === "horizontal") {
        positions.set(id, { x: alongCentre - size.w / 2, y: laneCentre - size.h / 2 });
      } else {
        positions.set(id, { x: laneCentre - size.w / 2, y: alongCentre - size.h / 2 });
      }
    });

    bands.push({
      laneId: laneIds[laneIndex],
      index: laneIndex,
      x: orientation === "horizontal" ? alongOrigin - padding : crossCursor,
      y: orientation === "horizontal" ? crossCursor : alongOrigin - padding,
      w: orientation === "horizontal" ? flowSpan + padding * 2 : bandThickness,
      h: orientation === "horizontal" ? bandThickness : flowSpan + padding * 2,
      headerExtent: alongOrigin + slotExtent[0],
      color: SWIMLANE_LANE_COLORS[laneIndex % SWIMLANE_LANE_COLORS.length],
    });

    crossCursor += bandThickness + laneGap;
  });

  // Centre the title over whatever the lane HEADERS line up under, so its
  // wires drop straight into them instead of running diagonally across the
  // bands:
  //  - horizontal bands put every header in one column at the left, so the
  //    title centres over that column (slot 0);
  //  - vertical lanes put the headers in a row across the top, so the title
  //    centres over the whole set of lane columns.
  const crossSpan = crossCursor - laneGap - crossOrigin;
  if (orientation === "horizontal") {
    positions.set(rootId, {
      x: alongOrigin + slotExtent[0] / 2 - rootSize.w / 2,
      y: rootY,
    });
  } else {
    positions.set(rootId, {
      x: crossOrigin + crossSpan / 2 - rootSize.w / 2,
      y: rootY,
    });
  }

  return { positions, bands, laneIds, laneCells };
}
