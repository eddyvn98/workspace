import type { CanvasBlock } from "../types/block";
import type { CanvasConnector } from "../types/connector";

export interface TreeviewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TreeviewPathResult {
  path: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

type Direction = "right" | "left" | "up" | "down";
type BranchStyle = "stacked" | "hierarchy";

const HIERARCHY_RAIL_INSET = 12;

function center(rect: TreeviewRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function edgeX(rect: TreeviewRect, growthSign: 1 | -1) {
  return growthSign > 0 ? rect.left + rect.width : rect.left;
}

function childEdgeX(rect: TreeviewRect, growthSign: 1 | -1) {
  return growthSign > 0 ? rect.left : rect.left + rect.width;
}

function path(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

/**
 * Ports legacy runLayoutCatalog/runLayoutCatalogHierarchy. The legacy
 * treeview intentionally starts stacked rails at the parent's bottom/top
 * center, while hierarchy descendants leave the parent's outer edge and fold
 * on the shared child-column gutter.
 */
export function buildTreeviewConnectorPath(
  connector: CanvasConnector,
  blocks: Record<string, CanvasBlock>,
  getRect: (id: string) => TreeviewRect | null,
  direction: Direction,
  style: BranchStyle,
  originX: number,
  originY: number,
): TreeviewPathResult | null {
  if (connector.waypoints?.length) return null;
  const parent = blocks[connector.fromBlockId];
  const child = blocks[connector.toBlockId];
  if (!parent || !child || child.parentId !== parent.id) return null;
  const parentRect = getRect(parent.id);
  const childRect = getRect(child.id);
  if (!parentRect || !childRect) return null;

  const flipX = direction === "left" || direction === "down";
  const flipY = direction === "up" || direction === "down";
  const growthSignX: 1 | -1 = flipX ? -1 : 1;
  const growthSignY: 1 | -1 = flipY ? -1 : 1;
  const parentCenter = center(parentRect);
  const childCenter = center(childRect);
  const childX = childEdgeX(childRect, growthSignX) - originX;
  const childY = childCenter.y - originY;
  const isRootHop = !parent.parentId;

  if (style === "stacked" || isRootHop) {
    const start = {
      x: parentCenter.x - originX,
      y: (growthSignY > 0 ? parentRect.top + parentRect.height : parentRect.top) - originY,
    };
    const end = { x: childX, y: childY };
    return { path: path([start, { x: start.x, y: end.y }, end]), start, end };
  }

  const parentEdge = { x: edgeX(parentRect, growthSignX) - originX, y: parentCenter.y - originY };
  const railX = childX - growthSignX * HIERARCHY_RAIL_INSET;
  const end = { x: childX, y: childY };
  return {
    path: path([parentEdge, { x: railX, y: parentEdge.y }, { x: railX, y: end.y }, end]),
    start: parentEdge,
    end,
  };
}
