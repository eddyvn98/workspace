import { parseSvgPathToPoints, type Point } from "./connectorHitTesting";

interface PathInput {
  id: string;
  d: string;
}

function pathPoints(d: string): Point[] {
  return parseSvgPathToPoints(d);
}

function intersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const determinant = (b.x - a.x) * (d.y - c.y) - (d.x - c.x) * (b.y - a.y);
  if (determinant === 0) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (d.x - c.x) * (c.y - a.y)) / determinant;
  const u = ((c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y)) / determinant;
  if (t <= 0.08 || t >= 0.92 || u <= 0.08 || u >= 0.92) return null;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

export function buildConnectorPathWithJumps(pathD: string, pathId: string, allPaths: PathInput[]): string {
  const points = pathPoints(pathD);
  if (points.length < 2) return pathD;
  const otherSegments = allPaths
    .filter((path) => path.id !== pathId)
    .flatMap((path) => {
      const pathVertices = pathPoints(path.d);
      return pathVertices.slice(0, -1).map((start, index) => ({ start, end: pathVertices[index + 1] }));
    });
  let result = `M ${points[0].x} ${points[0].y}`;
  const radius = 5;
  let hasJump = false;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const hits = otherSegments
      .map((segment) => intersection(start, end, segment.start, segment.end))
      .filter((point): point is Point => point !== null)
      .sort((left, right) => Math.hypot(left.x - start.x, left.y - start.y) - Math.hypot(right.x - start.x, right.y - start.y));
    if (hits.length === 0) {
      result += ` L ${end.x} ${end.y}`;
      continue;
    }
    hasJump = true;
    const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const unitX = (end.x - start.x) / length;
    const unitY = (end.y - start.y) / length;
    for (const hit of hits) {
      result += ` L ${hit.x - radius * unitX} ${hit.y - radius * unitY}`;
      result += ` A ${radius} ${radius} 0 0 1 ${hit.x + radius * unitX} ${hit.y + radius * unitY}`;
    }
    result += ` L ${end.x} ${end.y}`;
  }
  return hasJump ? result : pathD;
}
