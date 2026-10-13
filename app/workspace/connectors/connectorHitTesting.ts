export interface Point {
  x: number;
  y: number;
}

export interface ConnectorSelectionCycle {
  point: Point | null;
  ids: string[];
  index: number;
}

export function sampleCubicBezier(
  sx: number, sy: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  ex: number, ey: number,
  numSamples = 10,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const mt = 1 - t;
    const x = mt ** 3 * sx + 3 * mt ** 2 * t * cp1x + 3 * mt * t ** 2 * cp2x + t ** 3 * ex;
    const y = mt ** 3 * sy + 3 * mt ** 2 * t * cp1y + 3 * mt * t ** 2 * cp2y + t ** 3 * ey;
    points.push({ x, y });
  }
  return points;
}

export function sampleQuadraticBezier(
  sx: number, sy: number,
  cx: number, cy: number,
  ex: number, ey: number,
  numSamples = 10,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const mt = 1 - t;
    const x = mt * mt * sx + 2 * mt * t * cx + t * t * ex;
    const y = mt * mt * sy + 2 * mt * t * cy + t * t * ey;
    points.push({ x, y });
  }
  return points;
}

export function parseSvgPathToPoints(d: string): Point[] {
  const tokens = d.match(/[A-Za-z]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const points: Point[] = [];
  let cursor = 0;
  let currX = 0;
  let currY = 0;

  while (cursor < tokens.length) {
    const cmd = tokens[cursor++];
    const upper = cmd.toUpperCase();
    const readNumbers = (count: number): number[] | null => {
      const vals: number[] = [];
      for (let i = 0; i < count; i++) {
        if (cursor >= tokens.length) return null;
        const num = Number(tokens[cursor]);
        if (!Number.isFinite(num)) return null;
        vals.push(num);
        cursor++;
      }
      return vals;
    };

    if (upper === "M") {
      const nums = readNumbers(2);
      if (!nums) break;
      currX = nums[0];
      currY = nums[1];
      points.push({ x: currX, y: currY });
    } else if (upper === "L") {
      const nums = readNumbers(2);
      if (!nums) break;
      currX = nums[0];
      currY = nums[1];
      points.push({ x: currX, y: currY });
    } else if (upper === "H") {
      const nums = readNumbers(1);
      if (!nums) break;
      currX = nums[0];
      points.push({ x: currX, y: currY });
    } else if (upper === "V") {
      const nums = readNumbers(1);
      if (!nums) break;
      currY = nums[0];
      points.push({ x: currX, y: currY });
    } else if (upper === "Q") {
      const nums = readNumbers(4);
      if (!nums) break;
      const [cx, cy, ex, ey] = nums;
      const sampled = sampleQuadraticBezier(currX, currY, cx, cy, ex, ey);
      points.push(...sampled.slice(1));
      currX = ex;
      currY = ey;
    } else if (upper === "C") {
      const nums = readNumbers(6);
      if (!nums) break;
      const [cp1x, cp1y, cp2x, cp2y, ex, ey] = nums;
      const sampled = sampleCubicBezier(currX, currY, cp1x, cp1y, cp2x, cp2y, ex, ey);
      points.push(...sampled.slice(1));
      currX = ex;
      currY = ey;
    } else if (upper === "A") {
      const nums = readNumbers(7);
      if (!nums) break;
      const [, , , , , ex, ey] = nums;
      points.push({ x: ex, y: ey });
      currX = ex;
      currY = ey;
    } else if (upper === "Z") {
      if (points.length > 0) {
        points.push({ x: points[0].x, y: points[0].y });
        currX = points[0].x;
        currY = points[0].y;
      }
    }
  }
  return points;
}

export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

export function distanceToPath(pathD: string, point: Point): number {
  const points = parseSvgPathToPoints(pathD);
  if (points.length === 0) return Infinity;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y);
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const dist = distanceToSegment(point, points[i], points[i + 1]);
    if (dist < min) min = dist;
  }
  return min;
}

export function isPointNearConnectorPath(pathD: string, point: Point, threshold = 14): boolean {
  return distanceToPath(pathD, point) <= threshold;
}

export function nextConnectorCycleIndex(
  ids: string[],
  previous: ConnectorSelectionCycle,
  point: Point,
): number {
  const sameSpot = previous.point
    && Math.hypot(previous.point.x - point.x, previous.point.y - point.y) <= 10
    && previous.ids.length === ids.length
    && previous.ids.every((id) => ids.includes(id));
  return sameSpot ? (previous.index + 1) % ids.length : 0;
}
