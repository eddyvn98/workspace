import type { BlockId } from "../types/block";
import type { TimelineLayoutPoint, TimelineLayoutSize } from "./timelineLayout";
import type { TreeDirection } from "./treeLayout";

/**
 * Timeline's layout math is canonical: milestones grow right and down, while
 * branch details keep their own side of the rail. Legacy mirrors that whole
 * result for the left/up directions around the map root. Workspace stores
 * top-left coordinates, so reflection is performed on each block center.
 */
export function orientTimelineLayout(
  positions: Map<BlockId, TimelineLayoutPoint>,
  rootId: BlockId,
  sizes: Map<BlockId, TimelineLayoutSize>,
  direction: TreeDirection,
): Map<BlockId, TimelineLayoutPoint> {
  if (direction !== "left" && direction !== "up") return positions;

  const root = positions.get(rootId);
  const rootSize = sizes.get(rootId);
  if (!root || !rootSize) return positions;

  const pivotX = root.x + rootSize.w / 2;
  const pivotY = root.y + rootSize.h / 2;

  positions.forEach((point, id) => {
    if (id === rootId) return;
    const size = sizes.get(id);
    if (!size) return;
    if (direction === "left") {
      const centerX = point.x + size.w / 2;
      point.x = pivotX * 2 - centerX - size.w / 2;
    } else {
      const centerY = point.y + size.h / 2;
      point.y = pivotY * 2 - centerY - size.h / 2;
    }
  });

  return positions;
}
