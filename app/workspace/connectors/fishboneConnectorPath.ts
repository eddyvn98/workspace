import type { CanvasBlock } from "../types/block";
import type { CanvasConnector } from "../types/connector";
import type { ConnectorAuxiliaryPath } from "./connectorAuxiliaryPathTypes";

export interface FishboneRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FishbonePathResult {
  path: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

const CATEGORY_X_OFFSET = 48;
const RIB_MIN_TICK = 12;

function centerY(rect: FishboneRect) {
  return rect.top + rect.height / 2;
}

function isAbove(parent: FishboneRect, child: FishboneRect) {
  return centerY(child) < centerY(parent);
}

function point(rect: FishboneRect, side: "left" | "right" | "top" | "bottom", originX: number, originY: number) {
  const x = side === "left" ? rect.left : side === "right" ? rect.left + rect.width : rect.left + rect.width / 2;
  const y = side === "top" ? rect.top : side === "bottom" ? rect.top + rect.height : centerY(rect);
  return { x: x - originX, y: y - originY };
}

function pathFrom(points: Array<{ x: number; y: number }>) {
  return points.map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

/** Returns the legacy fishbone spine for the synthetic root connector. */
function backbonePath(
  connector: CanvasConnector,
  blocks: Record<string, CanvasBlock>,
  getRect: (id: string) => FishboneRect | null,
  originX: number,
  originY: number,
): FishbonePathResult | null {
  const root = blocks[connector.fromBlockId];
  const rootRect = getRect(connector.fromBlockId);
  if (!root || !rootRect || connector.id !== `${root.id}-fishbone-backbone`) return null;

  const categories = Object.values(blocks)
    .filter((block) => block.parentId === root.id)
    .map((block) => getRect(block.id))
    .filter((rect): rect is FishboneRect => Boolean(rect));
  const start = point(rootRect, "right", originX, originY);
  const endX = categories.reduce(
    (max, rect) => Math.max(max, rect.left - originX - CATEGORY_X_OFFSET),
    start.x,
  );
  const end = { x: endX, y: start.y };
  return { path: `M ${start.x} ${start.y} H ${end.x}`, start, end };
}

/**
 * Ports legacy fishbone wiring: root entries are diagonal, while every
 * descendant branch shares one diagonal rib and uses horizontal ticks into
 * the sibling nodes. Returns null for non-fishbone/manual connectors.
 */
export function buildFishboneConnectorPath(
  connector: CanvasConnector,
  blocks: Record<string, CanvasBlock>,
  getRect: (id: string) => FishboneRect | null,
  originX: number,
  originY: number,
): FishbonePathResult | null {
  const backbone = backbonePath(connector, blocks, getRect, originX, originY);
  if (backbone) return backbone;

  if (connector.waypoints?.length) return null;

  const parent = blocks[connector.fromBlockId];
  const child = blocks[connector.toBlockId];
  if (!parent || !child || child.parentId !== parent.id) return null;

  const parentRect = getRect(parent.id);
  const childRect = getRect(child.id);
  if (!parentRect || !childRect) return null;

  const parentIsRoot = !parent.parentId;
  if (parentIsRoot) {
    const above = isAbove(parentRect, childRect);
    // The legacy renderer starts each category entry at its spine slot, not at
    // the root's right edge. The synthetic backbone owns the segment between
    // those points; starting here keeps the category diagonal attached to the
    // same point as the rendered fishbone spine.
    const start = {
      x: childRect.left - originX - CATEGORY_X_OFFSET,
      y: centerY(parentRect) - originY,
    };
    const end = point(childRect, above ? "top" : "bottom", originX, originY);
    end.x = childRect.left - originX;
    return { path: pathFrom([start, end]), start, end };
  }

  const siblings = Object.values(blocks)
    .filter((block) => block.parentId === parent.id)
    .map((block) => ({ block, rect: getRect(block.id) }))
    .filter((entry): entry is { block: CanvasBlock; rect: FishboneRect } => Boolean(entry.rect));
  const above = isAbove(parentRect, childRect);
  const start = point(parentRect, above ? "top" : "bottom", originX, originY);
  start.x = parentRect.left + parentRect.width - originX;

  const edgeY = (rect: FishboneRect) => (above ? rect.top + rect.height : rect.top) - originY;
  const last = siblings.reduce((selected, entry) => {
    if (!selected) return entry;
    return above ? edgeY(entry.rect) < edgeY(selected.rect) ? entry : selected
      : edgeY(entry.rect) > edgeY(selected.rect) ? entry : selected;
  }, null as { block: CanvasBlock; rect: FishboneRect } | null);
  if (!last) return null;

  const lastEdgeY = edgeY(last.rect);
  const ribEndX = Math.max(start.x + RIB_MIN_TICK, last.rect.left - originX - RIB_MIN_TICK);
  const ribSpan = lastEdgeY - start.y;
  const childEdgeY = edgeY(childRect);
  const ratio = ribSpan === 0 ? 1 : Math.min(1, Math.max(0, (childEdgeY - start.y) / ribSpan));
  const axisX = start.x + (ribEndX - start.x) * ratio;
  const end = { x: childRect.left - originX, y: childEdgeY };
  return {
    path: pathFrom([start, { x: axisX, y: childEdgeY }, end]),
    start,
    end,
  };
}

export function buildFishboneRibPath(
  parentId: string,
  blocks: Record<string, CanvasBlock>,
  getRect: (id: string) => FishboneRect | null,
  originX: number,
  originY: number,
): string | null {
  const parent = blocks[parentId];
  const parentRect = parent ? getRect(parent.id) : null;
  if (!parent || !parentRect || !parent.parentId) return null;
  const children = Object.values(blocks)
    .filter((block) => block.parentId === parent.id)
    .map((block) => getRect(block.id))
    .filter((rect): rect is FishboneRect => Boolean(rect));
  if (children.length < 2) return null;

  const above = isAbove(parentRect, children[0]);
  const start = point(parentRect, above ? "top" : "bottom", originX, originY);
  start.x = parentRect.left + parentRect.width - originX;
  const edgeY = (rect: FishboneRect) => (above ? rect.top + rect.height : rect.top) - originY;
  const lastEdgeY = children.reduce((value, rect) => above ? Math.min(value, edgeY(rect)) : Math.max(value, edgeY(rect)), edgeY(children[0]));
  const endX = Math.max(start.x + RIB_MIN_TICK, Math.min(...children.map((rect) => rect.left - originX)) - RIB_MIN_TICK);
  return pathFrom([start, { x: endX, y: lastEdgeY }]);
}

export function collectFishboneRibPaths(
  blocks: Record<string, CanvasBlock>,
  isFishbone: (blockId: string) => boolean,
  getRect: (id: string) => FishboneRect | null,
  originX: number,
  originY: number,
) : ConnectorAuxiliaryPath[] {
  return Array.from(new Set(Object.values(blocks).map((block) => block.parentId).filter((id): id is string => Boolean(id))))
    .map((parentId) => {
      const path = isFishbone(parentId) ? buildFishboneRibPath(parentId, blocks, getRect, originX, originY) : null;
      return path ? { parentId, path } : null;
    })
    .filter((value): value is ConnectorAuxiliaryPath => Boolean(value));
}
