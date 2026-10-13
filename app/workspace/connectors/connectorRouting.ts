import { compactAnchoredRoute } from "./connectorAnchoredRouting";
export { compactAnchoredRoute } from "./connectorAnchoredRouting";
import type { AnchorSide } from "../types/connector";
import { pickFacingSide, pointOnRectSide } from "./anchorRegistry";
import { findGridOrthogonalRoute } from "./orthogonalGridRouter";

export const GRID_SEARCH_MARGIN = 420;

export interface RoutePoint {
  x: number;
  y: number;
}

const CLEARANCE = 12;
const MIN_PORT_LEAD = 28;
const SIDES: AnchorSide[] = ["top", "right", "bottom", "left"];

function segmentHits(a: RoutePoint, b: RoutePoint, obstacles: DOMRect[]): boolean {
  for (const rect of obstacles) {
    const left = rect.left - CLEARANCE;
    const right = rect.right + CLEARANCE;
    const top = rect.top - CLEARANCE;
    const bottom = rect.bottom + CLEARANCE;
    if (a.x === b.x && a.x > left && a.x < right
      && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom) return true;
    if (a.y === b.y && a.y > top && a.y < bottom
      && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right) return true;
  }
  return false;
}

function simplify(points: RoutePoint[]): RoutePoint[] {
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1];
    const next = points[index + 1];
    return !((previous.x === point.x && point.x === next.x)
      || (previous.y === point.y && point.y === next.y));
  });
}

function score(points: RoutePoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.abs(points[index].x - points[index - 1].x)
      + Math.abs(points[index].y - points[index - 1].y);
  }
  return length + Math.min(Math.max(0, points.length - 2), 1) * 8;
}

function clear(points: RoutePoint[], obstacles: DOMRect[]): boolean {
  return points.every((point, index) =>
    index === 0 || !segmentHits(points[index - 1], point, obstacles)
  );
}

function collisionCount(points: RoutePoint[], obstacles: DOMRect[]): number {
  let hits = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (segmentHits(points[index - 1], points[index], obstacles)) hits += 1;
  }
  return hits;
}

function gridObstacleSubset(start: RoutePoint, end: RoutePoint, obstacles: DOMRect[]): DOMRect[] {
  const left = Math.min(start.x, end.x) - GRID_SEARCH_MARGIN;
  const right = Math.max(start.x, end.x) + GRID_SEARCH_MARGIN;
  const top = Math.min(start.y, end.y) - GRID_SEARCH_MARGIN;
  const bottom = Math.max(start.y, end.y) + GRID_SEARCH_MARGIN;
  return obstacles.filter((rect) =>
    rect.left + rect.width >= left && rect.left <= right
      && rect.top + rect.height >= top && rect.top <= bottom,
  );
}

function leadPoint(point: RoutePoint, side: AnchorSide, distance = MIN_PORT_LEAD): RoutePoint {
  switch (side) {
    case "top": return { x: point.x, y: point.y - distance };
    case "right": return { x: point.x + distance, y: point.y };
    case "bottom": return { x: point.x, y: point.y + distance };
    case "left": return { x: point.x - distance, y: point.y };
    default: return point;
  }
}

function candidateRoutes(start: RoutePoint, end: RoutePoint, obstacles: DOMRect[]): RoutePoint[][] {
  const minX = Math.min(start.x, end.x, ...obstacles.map((r) => r.left - CLEARANCE));
  const maxX = Math.max(start.x, end.x, ...obstacles.map((r) => r.right + CLEARANCE));
  const minY = Math.min(start.y, end.y, ...obstacles.map((r) => r.top - CLEARANCE));
  const maxY = Math.max(start.y, end.y, ...obstacles.map((r) => r.bottom + CLEARANCE));
  const middleX = (start.x + end.x) / 2;
  const middleY = (start.y + end.y) / 2;

  return [
    ...(start.x === end.x || start.y === end.y ? [[start, end]] : []),
    [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end],
    [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end],
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
    [start, { x: minX - CLEARANCE, y: start.y }, { x: minX - CLEARANCE, y: end.y }, end],
    [start, { x: maxX + CLEARANCE, y: start.y }, { x: maxX + CLEARANCE, y: end.y }, end],
    [start, { x: start.x, y: minY - CLEARANCE }, { x: end.x, y: minY - CLEARANCE }, end],
    [start, { x: start.x, y: maxY + CLEARANCE }, { x: end.x, y: maxY + CLEARANCE }, end],
  ];
}

function routeBetween(start: RoutePoint, end: RoutePoint, obstacles: DOMRect[]): RoutePoint[] {
  const relevant = gridObstacleSubset(start, end, obstacles);
  const candidates = candidateRoutes(start, end, relevant);
  const simplified = candidates.map(simplify);
  const clearPool = simplified.filter((candidate) => clear(candidate, relevant));
  if (clearPool.length > 0) {
    return clearPool.sort((a, b) => score(a) - score(b))[0];
  }
  const gridRoute = findGridOrthogonalRoute(start, end, relevant, 4);
  if (gridRoute) return gridRoute;
  return simplified.sort((a, b) => {
    const collisionDiff = collisionCount(a, relevant) - collisionCount(b, relevant);
    return collisionDiff !== 0 ? collisionDiff : score(a) - score(b);
  })[0];
}

export function routeOrthogonal(
  p1: RoutePoint,
  p2: RoutePoint,
  obstacles: DOMRect[],
  fromSide?: AnchorSide,
  toSide?: AnchorSide,
  options: { compactAnchored?: boolean; endpointRects?: { from: DOMRect; to: DOMRect } } = {},
): string {
  const compact = fromSide && toSide
    ? compactAnchoredRoute(p1, p2, obstacles, fromSide, toSide, options.endpointRects)
    : null;
  const routeObstacles = options.endpointRects
    ? [...obstacles, options.endpointRects.from, options.endpointRects.to] : obstacles;
  const points = compact ?? (fromSide && toSide
    ? [p1, ...routeBetween(leadPoint(p1, fromSide), leadPoint(p2, toSide), routeObstacles), p2]
    : routeBetween(p1, p2, obstacles));
  return points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
}

export interface OrthogonalAutoResult {
  path: string;
  fromSide: AnchorSide;
  toSide: AnchorSide;
}

export function routeOrthogonalAuto(
  fromRect: DOMRect,
  toRect: DOMRect,
  obstacles: DOMRect[]
): OrthogonalAutoResult {
  // Check cheap compact paths for every side pair before invoking grid search.
  for (const searchObstacles of [false, true]) {
    const candidates: Array<OrthogonalAutoResult & { cost: number }> = [];
    for (const fromSide of SIDES) {
      const start = pointOnRectSide(fromRect, fromSide);
      for (const toSide of SIDES) {
        const end = pointOnRectSide(toRect, toSide);
        const points = compactAnchoredRoute(start, end, gridObstacleSubset(start, end, obstacles),
          fromSide, toSide, { from: fromRect, to: toRect }, searchObstacles);
        if (points) candidates.push({ fromSide, toSide, cost: score(points),
          path: points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ") });
      }
    }
    if (candidates.length) {
      const best = candidates.sort((a, b) => a.cost - b.cost)[0];
      return {
        fromSide: best.fromSide,
        toSide: best.toSide,
        path: best.path,
      };
    }
  }
  // Overlapping/containing endpoints may have no collision-free route.
  const fromSide = pickFacingSide(fromRect, toRect), toSide = pickFacingSide(toRect, fromRect);
  return { fromSide, toSide, path: routeOrthogonal(pointOnRectSide(fromRect, fromSide),
    pointOnRectSide(toRect, toSide), obstacles, fromSide, toSide, { endpointRects: { from: fromRect, to: toRect } }) };
}
