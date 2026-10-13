import type { CanvasBlock } from "../types/block";
import type { CanvasConnector } from "../types/connector";
import type { ConnectorAuxiliaryPath } from "./connectorAuxiliaryPathTypes";

export interface TimelineRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TimelinePathResult {
  path: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

type Axis = "horizontal" | "vertical";
type DescendantStyle = "tree" | "hierarchy";

const HIERARCHY_RAIL_INSET = 12;
const VERTICAL_BRANCH_GAP = 24;

function cx(rect: TimelineRect) { return rect.left + rect.width / 2; }
function cy(rect: TimelineRect) { return rect.top + rect.height / 2; }
function path(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function edge(rect: TimelineRect, side: "left" | "right" | "top" | "bottom", originX: number, originY: number) {
  const x = side === "left" ? rect.left : side === "right" ? rect.left + rect.width : cx(rect);
  const y = side === "top" ? rect.top : side === "bottom" ? rect.top + rect.height : cy(rect);
  return { x: x - originX, y: y - originY };
}

function horizontalSign(parent: TimelineRect, child: TimelineRect) {
  return cx(child) >= cx(parent) ? 1 : -1;
}

function orderedMilestones(
  parentId: string,
  blocks: Record<string, CanvasBlock>,
  orderedBlockIds?: readonly string[],
) {
  const ids = orderedBlockIds?.length ? orderedBlockIds : Object.keys(blocks);
  return ids.filter((id) => blocks[id]?.parentId === parentId);
}

/** Ports the legacy timeline rail/tick route for one stored parent→child edge. */
export function buildTimelineConnectorPath(
  connector: CanvasConnector,
  blocks: Record<string, CanvasBlock>,
  getRect: (id: string) => TimelineRect | null,
  axis: Axis,
  descendantStyle: DescendantStyle,
  originX: number,
  originY: number,
  orderedBlockIds?: readonly string[],
): TimelinePathResult | null {
  if (connector.waypoints?.length) return null;
  const parent = blocks[connector.fromBlockId];
  const child = blocks[connector.toBlockId];
  if (!parent || !child || child.parentId !== parent.id) return null;
  const parentRect = getRect(parent.id);
  const childRect = getRect(child.id);
  if (!parentRect || !childRect) return null;

  const parentIsRoot = !parent.parentId;
  const parentIsMilestone = Boolean(parent.parentId && !blocks[parent.parentId]?.parentId);
  if (axis === "horizontal") {
    // Timeline connectors are stored as parent→milestone edges, but the
    // legacy renderer draws one sequential rail: root→m1→m2. Use the
    // persisted block order to resolve the preceding milestone before
    // falling back to the direct parent geometry.
    if (parentIsRoot) {
      const milestones = orderedMilestones(parent.id, blocks, orderedBlockIds);
      const index = milestones.indexOf(child.id);
      const previousId = index > 0 ? milestones[index - 1] : parent.id;
      const previousRect = getRect(previousId) ?? parentRect;
      const sign = horizontalSign(previousRect, childRect);
      const start = edge(previousRect, sign > 0 ? "right" : "left", originX, originY);
      const end = edge(childRect, sign > 0 ? "left" : "right", originX, originY);
      return { path: `M ${start.x} ${start.y} H ${end.x}`, start, end };
    }
    const sign = horizontalSign(parentRect, childRect);

    if (descendantStyle === "hierarchy") {
      const parentEdgeX = sign > 0 ? parentRect.left + parentRect.width - originX : parentRect.left - originX;
      const childEdgeX = sign > 0 ? childRect.left - originX : childRect.left + childRect.width - originX;
      const railX = childEdgeX - sign * HIERARCHY_RAIL_INSET;
      const startPoint = { x: parentEdgeX, y: cy(parentRect) - originY };
      const endPoint = { x: childEdgeX, y: cy(childRect) - originY };
      return { path: path([startPoint, { x: railX, y: startPoint.y }, { x: railX, y: endPoint.y }, endPoint]), start: startPoint, end: endPoint };
    }

    const startPoint = { x: cx(parentRect) - originX, y: cy(childRect) - originY };
    const endPoint = { x: sign > 0 ? childRect.left - originX : childRect.left + childRect.width - originX, y: startPoint.y };
    return { path: `M ${startPoint.x} ${startPoint.y} H ${endPoint.x}`, start: startPoint, end: endPoint };
  }

  if (parentIsRoot) {
    const milestones = orderedMilestones(parent.id, blocks, orderedBlockIds);
    const index = milestones.indexOf(child.id);
    const previousId = index > 0 ? milestones[index - 1] : parent.id;
    const previousRect = getRect(previousId) ?? parentRect;
    const goesDown = cy(childRect) >= cy(previousRect);
    const start = edge(previousRect, goesDown ? "bottom" : "top", originX, originY);
    const end = edge(childRect, goesDown ? "top" : "bottom", originX, originY);
    return { path: `M ${start.x} ${start.y} V ${end.y}`, start, end };
  }

  const sign = cx(childRect) >= cx(parentRect) ? 1 : -1;

  if (descendantStyle === "hierarchy") {
    const parentEdgeX = sign > 0 ? parentRect.left + parentRect.width - originX : parentRect.left - originX;
    const childEdgeX = sign > 0 ? childRect.left - originX : childRect.left + childRect.width - originX;
    const railX = childEdgeX - sign * HIERARCHY_RAIL_INSET;
    const startPoint = { x: parentEdgeX, y: cy(parentRect) - originY };
    const endPoint = { x: childEdgeX, y: cy(childRect) - originY };
    return { path: path([startPoint, { x: railX, y: startPoint.y }, { x: railX, y: endPoint.y }, endPoint]), start: startPoint, end: endPoint };
  }

  const childEdgeX = sign > 0 ? childRect.left - originX : childRect.left + childRect.width - originX;
  const parentEdgeX = sign > 0 ? parentRect.left + parentRect.width - originX : parentRect.left - originX;
  // The first milestone→activity hop uses the legacy fixed branch axis. A
  // deeper tree hop uses the midpoint between the real parent/child edges;
  // using the fixed 24px rail at every depth visibly skews level-3+ wires.
  const branchX = parentIsMilestone
    ? parentEdgeX + sign * VERTICAL_BRANCH_GAP
    : (parentEdgeX + childEdgeX) / 2;
  const startPoint = { x: parentEdgeX, y: cy(parentRect) - originY };
  const endPoint = { x: childEdgeX, y: cy(childRect) - originY };
  return { path: path([startPoint, { x: branchX, y: startPoint.y }, { x: branchX, y: endPoint.y }, endPoint]), start: startPoint, end: endPoint };
}

/** Legacy horizontal timeline tree mode's shared vertical branch axis. */
export function buildTimelineAxisPath(
  parentId: string,
  blocks: Record<string, CanvasBlock>,
  getRect: (id: string) => TimelineRect | null,
  originX: number,
  originY: number,
): string | null {
  const parent = blocks[parentId];
  const parentRect = parent ? getRect(parentId) : null;
  if (!parent || !parentRect || !parent.parentId) return null;
  const children = Object.values(blocks)
    .filter((block) => block.parentId === parentId)
    .map((block) => getRect(block.id))
    .filter((rect): rect is TimelineRect => Boolean(rect));
  if (!children.length) return null;
  const above = cy(children[0]) < cy(parentRect);
  const outer = children.reduce((value, rect) => above ? Math.min(value, cy(rect)) : Math.max(value, cy(rect)), cy(children[0]));
  const startY = (above ? parentRect.top : parentRect.top + parentRect.height) - originY;
  return `M ${cx(parentRect) - originX} ${startY} V ${outer - originY}`;
}

export function collectTimelineAxisPaths(
  blocks: Record<string, CanvasBlock>,
  isTimelineTree: (blockId: string) => boolean,
  getRect: (id: string) => TimelineRect | null,
  originX: number,
  originY: number,
) : ConnectorAuxiliaryPath[] {
  return Array.from(new Set(Object.values(blocks).map((block) => block.parentId).filter((id): id is string => Boolean(id))))
    .map((parentId) => {
      const path = isTimelineTree(parentId) ? buildTimelineAxisPath(parentId, blocks, getRect, originX, originY) : null;
      return path ? { parentId, path } : null;
    })
    .filter((value): value is ConnectorAuxiliaryPath => Boolean(value));
}
