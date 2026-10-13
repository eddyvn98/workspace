import { parseSvgPathToPoints } from "./connectorHitTesting";

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathLabelPlacement {
  point: PathPoint;
  angle: number;
  /** Arc-length fraction along the rendered connector, in the [0, 1] range. */
  fraction: number;
}

function curveValues(pathD: string, command: "Q" | "C"): number[] | null {
  const match = pathD.match(new RegExp(`^\\s*M\\s*[-+.\\d]+[ ,]+[-+.\\d]+\\s*${command}\\b`, "i"));
  if (!match) return null;
  const values = pathD.match(/[-+.\d]+/g)?.map(Number) ?? [];
  return values.length >= (command === "Q" ? 6 : 8) ? values : null;
}

export function getPathPoints(pathD: string, fallbackStart: PathPoint, fallbackEnd: PathPoint): PathPoint[] {
  // Legacy Q paths expose the control point as a vertex. Keep that contract
  // for connector labels and bend handles; hit-testing samples the rendered
  // curve directly in connectorHitTesting.ts.
  const quadratic = curveValues(pathD, "Q");
  if (quadratic) {
    const [x0, y0, cx, cy, x1, y1] = quadratic;
    return [{ x: x0, y: y0 }, { x: cx, y: cy }, { x: x1, y: y1 }];
  }
  const parsed = parseSvgPathToPoints(pathD);
  return parsed.length >= 2 ? parsed : [fallbackStart, fallbackEnd];
}

export function getPathSegmentMidpoints(pathD: string, start: PathPoint, end: PathPoint, segmentCount?: number): PathPoint[] {
  const points = getPathPoints(pathD, start, end);
  const lengths = points.slice(0, -1).map((point, index) =>
    Math.hypot(points[index + 1].x - point.x, points[index + 1].y - point.y),
  );
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (points.length < 2 || total === 0) return [];
  const cumulative = [0];
  for (const length of lengths) cumulative.push(cumulative[cumulative.length - 1] + length);
  const requestedCount = Math.max(1, segmentCount ?? points.length - 1);
  return Array.from({ length: requestedCount }, (_, segment) => {
    const target = (total * (segment + 0.5)) / requestedCount;
    let index = 0;
    while (index < lengths.length - 1 && (cumulative[index + 1] < target || lengths[index] === 0)) index += 1;
    const ratio = lengths[index] === 0 ? 0 : (target - cumulative[index]) / lengths[index];
    const point = points[index];
    const next = points[index + 1];
    return { x: point.x + ratio * (next.x - point.x), y: point.y + ratio * (next.y - point.y) };
  });
}

/**
 * Which real segment of the rendered polyline the arc-length midpoint (the
 * same point getPathMidpoint returns) falls on. A connector with no explicit
 * waypoints yet shows a single "click to bend" handle at that midpoint - the
 * handle must report the segment it's actually sitting on so the first drag
 * targets it, instead of always assuming segment 0 (correct only for a
 * 1-bend path, where the midpoint always lands on the only middle segment;
 * a path with more bends - e.g. a swimlane loop route - puts the midpoint on
 * a later segment, and dragging a mismatched segment 0 first produced two
 * stray waypoints at the wrong spot before a second drag could reach the
 * intended bend).
 */
export function getPathMidpointSegmentIndex(pathD: string, start: PathPoint, end: PathPoint): number {
  const points = getPathPoints(pathD, start, end);
  const total = points.slice(0, -1).reduce((sum, point, index) => {
    return sum + Math.hypot(points[index + 1].x - point.x, points[index + 1].y - point.y);
  }, 0);
  if (total === 0 || points.length < 2) return 0;
  let travelled = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    const length = Math.hypot(next.x - point.x, next.y - point.y);
    if (travelled + length >= total / 2) return index;
    travelled += length;
  }
  return points.length - 2;
}

export function getPathMidpoint(pathD: string, start: PathPoint, end: PathPoint): PathPoint {
  const points = getPathPoints(pathD, start, end);
  const total = points.slice(0, -1).reduce((sum, point, index) => {
    return sum + Math.hypot(points[index + 1].x - point.x, points[index + 1].y - point.y);
  }, 0);
  if (total === 0) return points[0] ?? start;
  let travelled = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    const length = Math.hypot(next.x - point.x, next.y - point.y);
    if (travelled + length >= total / 2) {
      const ratio = length === 0 ? 0 : (total / 2 - travelled) / length;
      return { x: point.x + (next.x - point.x) * ratio, y: point.y + (next.y - point.y) * ratio };
    }
    travelled += length;
  }
  return points[Math.floor(points.length / 2)] ?? start;
}

/**
 * Choose a label position on the most spacious segment of an orthogonal
 * connector. The arc-length midpoint is useful for bend handles, but it is a
 * poor label position for long return routes: the midpoint often lands on a
 * distant vertical channel beside an unrelated branch. A longest-segment
 * placement keeps the label centered in the available wire space.
 */
export function getPathLabelPlacement(pathD: string, start: PathPoint, end: PathPoint, labelPosition?: number, preferredSegmentIndices?: readonly number[]): PathLabelPlacement {
  const points = getPathPoints(pathD, start, end);
  if (points.length < 2) return { point: start, angle: 0, fraction: 0 };
  // A short source stub is often followed by a much longer open segment
  // (e.g. `OTP sai`). Choosing the first segment put the label near one end
  // even though the same wire had a better, emptier place farther along.
  // Prefer the longest segment with enough room for a label; fall back to the
  // longest segment when the connector is compact.
  const minimumLength = 80;
  const segments = points.slice(0, -1).map((a, index) => {
    const b = points[index + 1];
    return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y) };
  });
  const lengths = segments.map((segment) => segment.length);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return { point: points[0], angle: 0, fraction: 0 };
  const cumulative = [0];
  for (const length of lengths) cumulative.push(cumulative[cumulative.length - 1] + length);
  const preferred = preferredSegmentIndices?.length
    ? segments.filter((_, index) => preferredSegmentIndices.includes(index))
    : segments;
  const candidates = preferred.length > 0 ? preferred : segments;
  const fallback = candidates.reduce((best, segment) => segment.length > best.length ? segment : best, candidates[0]);
  const best = candidates.filter((segment) => segment.length >= minimumLength)
    .reduce((bestSegment, segment) => segment.length > bestSegment.length ? segment : bestSegment, fallback);
  const defaultFraction = (cumulative[segments.indexOf(best)] + best.length / 2) / total;
  const fraction = Number.isFinite(labelPosition) ? Math.max(0.02, Math.min(0.98, labelPosition!)) : defaultFraction;
  const distance = fraction * total;
  let segmentIndex = 0;
  while (segmentIndex < lengths.length - 1 && cumulative[segmentIndex + 1] < distance) segmentIndex += 1;
  const segment = segments[segmentIndex] ?? best;
  const segmentStart = cumulative[segmentIndex] ?? 0;
  const ratio = segment.length === 0 ? 0 : Math.max(0, Math.min(1, (distance - segmentStart) / segment.length));
  const point = {
    x: segment.a.x + (segment.b.x - segment.a.x) * ratio,
    y: segment.a.y + (segment.b.y - segment.a.y) * ratio,
  };
  let angle = Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  return { point, angle, fraction };
}

export function getPathLabelPoint(pathD: string, start: PathPoint, end: PathPoint): PathPoint {
  return getPathLabelPlacement(pathD, start, end).point;
}

/** Projects a pointer onto the rendered connector so a label can slide along
 * the wire without creating or moving any connector waypoint. */
export function projectPointToPath(pathD: string, start: PathPoint, end: PathPoint, point: PathPoint): PathLabelPlacement {
  const points = getPathPoints(pathD, start, end);
  if (points.length < 2) return { point: start, angle: 0, fraction: 0 };
  const lengths = points.slice(0, -1).map((from, index) => Math.hypot(points[index + 1].x - from.x, points[index + 1].y - from.y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return { point: points[0], angle: 0, fraction: 0 };
  let bestDistance = Infinity;
  let bestAlong = 0;
  let bestIndex = 0;
  let cumulative = 0;
  lengths.forEach((length, index) => {
    const from = points[index];
    const to = points[index + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const ratio = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (length * length)));
    const projected = { x: from.x + dx * ratio, y: from.y + dy * ratio };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlong = cumulative + length * ratio;
      bestIndex = index;
    }
    cumulative += length;
  });
  const from = points[bestIndex];
  const to = points[bestIndex + 1];
  const length = lengths[bestIndex];
  const ratio = length === 0 ? 0 : Math.max(0, Math.min(1, (bestAlong - lengths.slice(0, bestIndex).reduce((sum, value) => sum + value, 0)) / length));
  let angle = Math.atan2(to.y - from.y, to.x - from.x);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  return {
    point: { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio },
    angle,
    fraction: Math.max(0.02, Math.min(0.98, bestAlong / total)),
  };
}

/** Direction of the legacy midpoint segment, normalized for label readability. */
export function getPathMidpointAngle(pathD: string, start: PathPoint, end: PathPoint): number {
  // Walk the same legacy polyline as getPathMidpoint and use the local
  // direction of the segment containing the 50%-arc-length point.
  const points = getPathPoints(pathD, start, end);
  const total = points.slice(0, -1).reduce((sum, point, index) => {
    return sum + Math.hypot(points[index + 1].x - point.x, points[index + 1].y - point.y);
  }, 0);
  if (total === 0) return Math.atan2(end.y - start.y, end.x - start.x);
  let travelled = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    const length = Math.hypot(next.x - point.x, next.y - point.y);
    if (travelled + length >= total / 2) {
      let angle = (Math.atan2(next.y - point.y, next.x - point.x) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      return (angle * Math.PI) / 180;
    }
    travelled += length;
  }
  return Math.atan2(end.y - start.y, end.x - start.x);
}

export function getPathAngles(pathD: string, start: PathPoint, end: PathPoint): { start: number; end: number } {
  const quadratic = curveValues(pathD, "Q");
  if (quadratic) {
    const [x0, y0, cx, cy, x1, y1] = quadratic;
    return { start: Math.atan2(cy - y0, cx - x0), end: Math.atan2(y1 - cy, x1 - cx) };
  }
  const cubic = curveValues(pathD, "C");
  if (cubic) {
    const [x0, y0, cp1x, cp1y, cp2x, cp2y, x1, y1] = cubic;
    return { start: Math.atan2(cp1y - y0, cp1x - x0), end: Math.atan2(y1 - cp2y, x1 - cp2x) };
  }
  const points = getPathPoints(pathD, start, end);
  return {
    start: Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x),
    end: Math.atan2(points[points.length - 1].y - points[points.length - 2].y, points[points.length - 1].x - points[points.length - 2].x),
  };
}
