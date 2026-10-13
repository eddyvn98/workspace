import type { BlockId } from "../types/block";
import type { TimelineLayoutSize } from "./timelineLayout";

const DEFAULT_WIDTH = 160;
const TIMELINE_LEVEL_GAP = 24;

export function collectTimelineLevelWidths(
  nodeId: BlockId,
  level: number,
  childrenByParent: Map<BlockId, BlockId[]>,
  sizes: Map<BlockId, TimelineLayoutSize>,
  widths: Map<number, number>,
): void {
  const size = sizes.get(nodeId);
  widths.set(level, Math.max(widths.get(level) ?? 0, size?.w ?? DEFAULT_WIDTH));
  for (const childId of childrenByParent.get(nodeId) ?? []) {
    collectTimelineLevelWidths(childId, level + 1, childrenByParent, sizes, widths);
  }
}

export function computeTimelineLevelOffsets(
  widths: Map<number, number>,
  firstMilestoneX: number,
): Map<number, number> {
  const offsets = new Map<number, number>();
  let cursor = firstMilestoneX;
  for (const level of [...widths.keys()].sort((a, b) => a - b)) {
    offsets.set(level, cursor);
    cursor += (widths.get(level) ?? DEFAULT_WIDTH) + TIMELINE_LEVEL_GAP;
  }
  return offsets;
}
