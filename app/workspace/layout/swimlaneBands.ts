import { resolveTransform, type BlockId, type CanvasBlock, type Transform } from "../types/block";
import { blockIdsInMap } from "./mapRoot";
import { SWIMLANE_LANE_COLORS, type SwimlaneBand, type SwimlaneOrientation } from "./swimlaneLayout";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
const FALLBACK_THICKNESS = 160;

/** Slack between the outermost node and the band edge. */
const BAND_MARGIN = 24;

/**
 * Lane bands measured from where the blocks ACTUALLY are, not from where a
 * layout pass would have put them.
 *
 * This is how the reference tool works, and confirming that took looking at
 * it: a Larksuite swimlane is a TABLE drawn behind the diagram plus ordinary
 * free-placed flowchart shapes on top. Nothing owns a shape. Dragging a step
 * from the "Inventory" row up into "Customer" leaves the table untouched, does
 * not reflow anything, and simply makes that step a Customer step — because
 * membership is decided by where the shape sits, and by nothing else.
 *
 * So the bands cannot come from a tree walk. Each row's thickness is the lane
 * header's own cross-axis size - the header is the row's label cell and fills
 * it edge to edge, exactly as the reference tool draws it - and the rows stack
 * from the first one, so they are contiguous and gapless the way a table's
 * are. Storing the thickness on the header rather than deriving it from the
 * gap between headers lets a boundary drag move the boundary by the distance
 * dragged instead of half that distance.
 */
export function computeGeometricSwimlaneBands(
  blocks: Record<BlockId, CanvasBlock>,
  rootId: BlockId,
  laneIds: BlockId[],
  orientation: SwimlaneOrientation,
): SwimlaneBand[] {
  const lanes = laneIds
    .map((laneId) => ({ laneId, rect: rectOf(blocks, laneId) }))
    .filter((lane): lane is { laneId: BlockId; rect: Transform } => lane.rect !== null);
  if (lanes.length === 0) return [];

  const horizontal = orientation === "horizontal";
  // Sorting by live position rather than child order is what makes dragging a
  // lane past its neighbour actually reorder the rows.
  lanes.sort((a, b) => crossStart(a.rect, horizontal) - crossStart(b.rect, horizontal));

  const along = alongExtent(blocks, rootId, horizontal);
  const headerEnd = Math.max(
    ...lanes.map((lane) => (horizontal ? lane.rect.x + lane.rect.w : lane.rect.y + lane.rect.h)),
  );

  const starts = lanes.map((lane) => crossStart(lane.rect, horizontal));
  const cellSized = lanes.slice(1).every((lane, index) => {
    const previous = lanes[index].rect;
    const previousStart = starts[index];
    const previousThickness = horizontal ? previous.h : previous.w;
    return Math.abs(starts[index + 1] - (previousStart + previousThickness)) < 0.5;
  });
  const boundaries = cellSized ? null : crossBoundaries(lanes.map((lane) => crossCentre(lane.rect, horizontal)));
  let cursor = cellSized ? starts[0] : boundaries![0];
  return lanes.map((lane, index) => {
    const thickness = cellSized
      ? (horizontal ? lane.rect.h : lane.rect.w)
      : boundaries![index + 1] - boundaries![index];
    const start = cursor;
    cursor += thickness;
    return {
      laneId: lane.laneId,
      index,
      x: horizontal ? along.start : start,
      y: horizontal ? start : along.start,
      w: horizontal ? along.end - along.start : thickness,
      h: horizontal ? thickness : along.end - along.start,
      headerExtent: headerEnd,
      color: SWIMLANE_LANE_COLORS[index % SWIMLANE_LANE_COLORS.length],
    };
  });
}

/** The lane a point falls in, or null if it is outside every band. This is the
 *  whole of "which lane does this step belong to" — see the note above. */
export function laneIdAtPoint(
  bands: SwimlaneBand[],
  point: { x: number; y: number },
): BlockId | null {
  const hit = bands.find((band) => (
    point.x >= band.x && point.x <= band.x + band.w
    && point.y >= band.y && point.y <= band.y + band.h
  ));
  return hit ? hit.laneId : null;
}

function rectOf(blocks: Record<BlockId, CanvasBlock>, blockId: BlockId): Transform | null {
  const block = blocks[blockId];
  return block ? resolveTransform(block.transform, DEFAULT_TRANSFORM) : null;
}

function crossStart(rect: Transform, horizontal: boolean): number {
  return horizontal ? rect.y : rect.x;
}

function crossCentre(rect: Transform, horizontal: boolean): number {
  return crossStart(rect, horizontal) + (horizontal ? rect.h : rect.w) / 2;
}

function crossBoundaries(centres: number[]): number[] {
  if (centres.length === 1) {
    return [centres[0] - FALLBACK_THICKNESS / 2, centres[0] + FALLBACK_THICKNESS / 2];
  }
  const inner = centres.slice(1).map((centre, index) => (centre + centres[index]) / 2);
  const leadHalf = Math.max(inner[0] - centres[0], FALLBACK_THICKNESS / 2);
  const tailHalf = Math.max(
    centres[centres.length - 1] - inner[inner.length - 1],
    FALLBACK_THICKNESS / 2,
  );
  return [centres[0] - leadHalf, ...inner, centres[centres.length - 1] + tailHalf];
}

/** How far the bands run along the flow axis: the whole diagram's span, so
 *  every row is the same length the way a table's columns are. */
function alongExtent(
  blocks: Record<BlockId, CanvasBlock>,
  rootId: BlockId,
  horizontal: boolean,
): { start: number; end: number } {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;

  for (const blockId of blockIdsInMap(blocks, rootId)) {
    const rect = rectOf(blocks, blockId);
    if (!rect) continue;
    const low = horizontal ? rect.x : rect.y;
    const high = horizontal ? rect.x + rect.w : rect.y + rect.h;
    if (low < start) start = low;
    if (high > end) end = high;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return { start: 0, end: 0 };
  return { start: start - BAND_MARGIN, end: end + BAND_MARGIN };
}
