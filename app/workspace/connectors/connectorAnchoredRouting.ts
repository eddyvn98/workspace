import type { AnchorSide } from "../types/connector";
import { findGridOrthogonalRoute, isGridRouteClear } from "./orthogonalGridRouter";

type Point = { x: number; y: number };
const CLEARANCE = 12;
const MIN_PORT_LEAD = 28;
const direction = (side: AnchorSide): Point => ({
  x: side === "right" ? 1 : side === "left" ? -1 : 0,
  y: side === "bottom" ? 1 : side === "top" ? -1 : 0,
});

function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last?.x === point.x && last.y === point.y) continue;
    const previous = result[result.length - 2];
    if (previous && last && (
      (previous.x === last.x && last.x === point.x && (last.y - previous.y) * (point.y - last.y) >= 0)
      || (previous.y === last.y && last.y === point.y && (last.x - previous.x) * (point.x - last.x) >= 0)
    )) result.pop();
    result.push(point);
  }
  return result;
}

function routeLength(points: Point[]): number {
  return points.reduce((total, point, index) => {
    if (index === 0) return total;
    const previous = points[index - 1];
    return total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
  }, 0);
}

function routeTurnCount(points: Point[]): number {
  let turns = 0;
  for (let index = 2; index < points.length; index += 1) {
    const before = points[index - 2];
    const current = points[index - 1];
    const after = points[index];
    const wasHorizontal = before.y === current.y;
    const isHorizontal = current.y === after.y;
    if (wasHorizontal !== isHorizontal) turns += 1;
  }
  return turns;
}

/**
 * A valid route with one fewer bend is usually easier to read than a route
 * with the same length that zig-zags through the middle. Keep length as the
 * tie-breaker so a small bend reduction cannot make a connector take a long
 * perimeter detour.
 */
function routeScore(points: Point[]): number {
  return routeLength(points) + routeTurnCount(points) * 32;
}

export function respectsAnchorDirections(points: Point[], fromSide: AnchorSide, toSide: AnchorSide): boolean {
  const clean = simplify(points);
  if (clean.length < 2) return false;
  const aligned = (a: Point, b: Point, side: AnchorSide) => {
    const vector = direction(side);
    const dx = b.x - a.x, dy = b.y - a.y;
    return dx * vector.x + dy * vector.y > 0 && dx * vector.y - dy * vector.x === 0;
  };
  return aligned(clean[0], clean[1], fromSide)
    && aligned(clean[clean.length - 1], clean[clean.length - 2], toSide);
}

export function compactAnchoredRoute(
  start: Point, end: Point, obstacles: DOMRect[], fromSide: AnchorSide, toSide: AnchorSide,
  endpointRects?: { from: DOMRect; to: DOMRect },
  searchObstacles = true,
): Point[] | null {
  const endpoints = endpointRects ? [endpointRects.from, endpointRects.to] : [];
  const isOrthogonal = (points: Point[]) => points.slice(1).every((point, index) => {
    const previous = points[index];
    return previous.x === point.x || previous.y === point.y;
  });
  const valid = (points: Point[]) => isOrthogonal(points)
    && respectsAnchorDirections(points, fromSide, toSide)
    && isGridRouteClear(points, obstacles, CLEARANCE) && isGridRouteClear(points, endpoints);
  const lead = (point: Point, side: AnchorSide, distance = MIN_PORT_LEAD) => {
    const vector = direction(side);
    return { x: point.x + vector.x * distance, y: point.y + vector.y * distance };
  };
  const startLead = lead(start, fromSide);
  const endLead = lead(end, toSide);
  const middleX = (startLead.x + endLead.x) / 2, middleY = (startLead.y + endLead.y) / 2;
  const leadCandidates: Point[][] = [
    [startLead, endLead],
    [startLead, { x: middleX, y: startLead.y }, { x: middleX, y: endLead.y }, endLead],
    [startLead, { x: startLead.x, y: middleY }, { x: endLead.x, y: middleY }, endLead],
    [startLead, { x: endLead.x, y: startLead.y }, endLead],
    [startLead, { x: startLead.x, y: endLead.y }, endLead],
  ];
  const candidates: Point[][] = [
    ...leadCandidates.map((candidate) => [start, ...candidate, end]),
  ];
  // Both ports face the same direction: one rail beyond the outermost port.
  if (fromSide === toSide) {
    const vector = direction(fromSide);
    const vertical = vector.y !== 0;
    const axis = vertical ? "y" : "x";
    const sign = vertical ? vector.y : vector.x;
    const rail = (sign < 0 ? Math.min(startLead[axis], endLead[axis]) : Math.max(startLead[axis], endLead[axis])) + sign * CLEARANCE;
    candidates.push(vertical
      ? [start, { x: startLead.x, y: rail }, { x: endLead.x, y: rail }, end]
      : [start, { x: rail, y: startLead.y }, { x: rail, y: endLead.y }, end]);
  }
  const compact = candidates
    .map(simplify)
    .filter(valid)
    .sort((a, b) => routeScore(a) - routeScore(b))[0];
  if (compact) return compact;

  if (!searchObstacles) return null;

  // Search between outward leads; endpoint rectangles remain obstacles here.
  const grid = findGridOrthogonalRoute(startLead, endLead, [...obstacles, ...endpoints], CLEARANCE);
  if (!grid) return null;
  const points = simplify([start, ...grid, end]);
  return valid(points) ? points : null;
}
