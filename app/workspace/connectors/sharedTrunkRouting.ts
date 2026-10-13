import type { AnchorSide, CanvasConnector } from "../types/connector";
import type { BlockId, CanvasBlock, MapLayoutSettings } from "../types/block";
import { buildSharedTrunkCurvePath, buildSharedTrunkOrthogonalPath } from "./connectorPathParity";

export interface SharedTrunkRoutingEntry {
  connector: CanvasConnector;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fromSide: AnchorSide;
  basePathD: string;
}

/**
 * Applies the same sibling-branch trunk rule to settled and live-drag paths.
 * Keeping this pass pure makes it cheap enough to run on the cached geometry
 * during a drag without reintroducing the full obstacle-avoidance pass.
 */
export function applySharedTrunkRouting<T extends SharedTrunkRoutingEntry>(
  entries: readonly T[],
  blocks: Record<BlockId, CanvasBlock>,
  getLayout: (blockId: BlockId) => MapLayoutSettings,
): T[] {
  const childCountByParentSide = new Map<string, number>();
  for (const entry of entries) {
    const { connector } = entry;
    if (connector.waypoints?.length) continue;
    if (connector.lineType && connector.lineType !== "curved" && connector.lineType !== "orthogonal") continue;
    if (blocks[connector.toBlockId]?.parentId !== connector.fromBlockId) continue;
    if (getLayout(connector.fromBlockId).family !== "hierarchy") continue;
    const key = `${connector.fromBlockId}|${entry.fromSide}`;
    childCountByParentSide.set(key, (childCountByParentSide.get(key) ?? 0) + 1);
  }

  return entries.map((entry) => {
    const { connector } = entry;
    const isBundledBranch = !connector.waypoints?.length
      && (!connector.lineType || connector.lineType === "curved" || connector.lineType === "orthogonal")
      && (childCountByParentSide.get(`${connector.fromBlockId}|${entry.fromSide}`) ?? 0) >= 2
      && getLayout(connector.fromBlockId).family === "hierarchy";
    if (!isBundledBranch) return entry;

    const axis = entry.fromSide === "top" || entry.fromSide === "bottom" ? "vertical" : "horizontal";
    const basePathD = connector.lineType === "orthogonal"
      ? buildSharedTrunkOrthogonalPath({ x: entry.x1, y: entry.y1 }, { x: entry.x2, y: entry.y2 }, axis)
      : buildSharedTrunkCurvePath({ x: entry.x1, y: entry.y1 }, { x: entry.x2, y: entry.y2 }, axis);
    return { ...entry, basePathD };
  });
}
