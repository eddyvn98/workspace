import type { AnchorSide } from "../../types/connector";
import type { SemanticDiagramEdge, SemanticDiagramRect, SemanticDiagramRoute } from "./types";

export function center(rect: SemanticDiagramRect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function sameCoordinate(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5;
}

export function dedupe(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  points.forEach((point) => {
    const previous = out[out.length - 1];
    if (!previous || !sameCoordinate(previous.x, point.x) || !sameCoordinate(previous.y, point.y)) out.push(point);
  });
  return out.filter((point, index) => {
    if (index === 0 || index === out.length - 1) return true;
    const previous = out[index - 1];
    const next = out[index + 1];
    return !(sameCoordinate(previous.x, point.x) && sameCoordinate(point.x, next.x))
      && !(sameCoordinate(previous.y, point.y) && sameCoordinate(point.y, next.y));
  });
}

export function segmentPassesThroughRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rect: SemanticDiagramRect,
): boolean {
  if (!sameCoordinate(a.x, b.x) && !sameCoordinate(a.y, b.y)) return true;
  if (sameCoordinate(a.x, b.x)) {
    return a.x > rect.x + 0.5 && a.x < rect.x + rect.w - 0.5
      && Math.max(Math.min(a.y, b.y), rect.y + 0.5)
        < Math.min(Math.max(a.y, b.y), rect.y + rect.h - 0.5);
  }
  return a.y > rect.y + 0.5 && a.y < rect.y + rect.h - 0.5
    && Math.max(Math.min(a.x, b.x), rect.x + 0.5)
      < Math.min(Math.max(a.x, b.x), rect.x + rect.w - 0.5);
}

export function routeIsClear(
  points: { x: number; y: number }[],
  edge: SemanticDiagramEdge,
  positions: Map<string, SemanticDiagramRect>,
): boolean {
  const segments = points.slice(1).map((point, index) => ({ a: points[index], b: point }));
  return [...positions.entries()]
    .filter(([key]) => key !== edge.from && key !== edge.to)
    .every(([, rect]) => !segments.some((segment) => segmentPassesThroughRect(segment.a, segment.b, rect)));
}

export function pointOnSide(rect: SemanticDiagramRect, side: AnchorSide): { x: number; y: number } {
  const c = center(rect);
  if (side === "top") return { x: c.x, y: rect.y };
  if (side === "right") return { x: rect.x + rect.w, y: c.y };
  if (side === "bottom") return { x: c.x, y: rect.y + rect.h };
  return { x: rect.x, y: c.y };
}

export function routePoints(edge: SemanticDiagramEdge, route: SemanticDiagramRoute, positions: Map<string, SemanticDiagramRect>): { x: number; y: number }[] {
  const from = positions.get(edge.from);
  const to = positions.get(edge.to);
  if (!from || !to) return [];
  return [pointOnSide(from, route.fromSide), ...route.waypoints, pointOnSide(to, route.toSide)];
}

export function properIntersection(
  a: { x: number; y: number }, b: { x: number; y: number },
  c: { x: number; y: number }, d: { x: number; y: number },
): boolean {
  const aVertical = sameCoordinate(a.x, b.x);
  const bVertical = sameCoordinate(c.x, d.x);
  if (aVertical === bVertical) return false;
  const vertical = aVertical ? [a, b] : [c, d];
  const horizontal = aVertical ? [c, d] : [a, b];
  const vx = vertical[0].x;
  const hy = horizontal[0].y;
  return vx > Math.min(horizontal[0].x, horizontal[1].x) + 0.5
    && vx < Math.max(horizontal[0].x, horizontal[1].x) - 0.5
    && hy > Math.min(vertical[0].y, vertical[1].y) + 0.5
    && hy < Math.max(vertical[0].y, vertical[1].y) - 0.5;
}

export function routeCrossingCount(
  points: { x: number; y: number }[],
  edge: SemanticDiagramEdge,
  edges: SemanticDiagramEdge[],
  routes: Map<number, SemanticDiagramRoute>,
  positions: Map<string, SemanticDiagramRect>,
): number {
  let crossings = 0;
  [...routes.entries()].forEach(([index, route]) => {
    const other = edges[index];
    if (!other || other.from === edge.from || other.from === edge.to || other.to === edge.from || other.to === edge.to) return;
    const otherPoints = routePoints(other, route, positions);
    points.slice(1).forEach((point, segmentIndex) => {
      const a = points[segmentIndex];
      otherPoints.slice(1).forEach((otherPoint, otherSegmentIndex) => {
        if (properIntersection(a, point, otherPoints[otherSegmentIndex], otherPoint)) crossings += 1;
      });
    });
  });
  return crossings;
}

export function routeAvoidsExisting(
  points: { x: number; y: number }[],
  edge: SemanticDiagramEdge,
  edges: SemanticDiagramEdge[],
  routes: Map<number, SemanticDiagramRoute>,
  positions: Map<string, SemanticDiagramRect>,
): boolean {
  return routeCrossingCount(points, edge, edges, routes, positions) === 0;
}

export function nearbyChannelValues(
  from: SemanticDiagramRect,
  to: SemanticDiagramRect,
  positions: Map<string, SemanticDiagramRect>,
  preferBelow: boolean,
): number[] {
  const local = [
    Math.max(from.y + from.h, to.y + to.h) + 24,
    Math.min(from.y, to.y) - 24,
    from.y + from.h + 24,
    to.y + to.h + 24,
    from.y - 24,
    to.y - 24,
  ];
  const obstacleChannels = [...positions.values()].flatMap((rect) => [rect.y - 24, rect.y + rect.h + 24]);
  const ordered = preferBelow ? local : [local[1], local[0], ...local.slice(2)];
  return [...new Set([...ordered, ...obstacleChannels])];
}

export function nearbyChannelXs(from: SemanticDiagramRect, to: SemanticDiagramRect, positions: Map<string, SemanticDiagramRect>): number[] {
  const min = Math.min(from.x + from.w, to.x);
  const max = Math.max(from.x, to.x + to.w);
  const boundaries = [...positions.values()].flatMap((rect) => [rect.x - 24, rect.x + rect.w + 24]);
  return [...new Set([
    min + 24,
    max - 24,
    (min + max) / 2,
    ...boundaries.filter((value) => value > min && value < max),
  ])];
}
