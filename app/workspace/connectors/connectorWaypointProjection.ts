import { getPathPoints, type PathPoint } from "./connectorPath";

export interface PathInsertionPoint extends PathPoint {
  insertIndex: number;
}

/** Project a pointer onto the rendered polyline and choose its insertion bucket. */
export function projectConnectorPointToPath(
  pathD: string,
  point: PathPoint,
  segmentCount: number,
  fallbackStart: PathPoint,
  fallbackEnd: PathPoint,
): PathInsertionPoint | null {
  const points = getPathPoints(pathD, fallbackStart, fallbackEnd);
  if (points.length < 2 || segmentCount < 1) return null;
  const lengths = points.slice(0, -1).map((current, index) =>
    Math.hypot(points[index + 1].x - current.x, points[index + 1].y - current.y),
  );
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (totalLength === 0) return null;

  let bestDistance = Infinity;
  let bestAlongPath = 0;
  let distanceAlongPath = 0;
  let bestPoint = points[0];
  for (let index = 0; index < lengths.length; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ));
    const projected = { x: start.x + ratio * dx, y: start.y + ratio * dy };
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlongPath = distanceAlongPath + lengths[index] * ratio;
      bestPoint = projected;
    }
    distanceAlongPath += lengths[index];
  }
  return {
    ...bestPoint,
    insertIndex: Math.min(segmentCount - 1, Math.floor(bestAlongPath / (totalLength / segmentCount))),
  };
}
