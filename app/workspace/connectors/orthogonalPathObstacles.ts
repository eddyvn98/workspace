const PATH_POINT = /[ML]\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi;
const TRACK_WIDTH = 1;

/** Turns a rendered orthogonal path into thin obstacles for later free-form routes. */
export function orthogonalPathObstacles(path: string): DOMRect[] {
  const points = [...path.matchAll(PATH_POINT)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  const obstacles: DOMRect[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from.x === to.x && from.y !== to.y) {
      obstacles.push({
        left: from.x - TRACK_WIDTH / 2,
        right: from.x + TRACK_WIDTH / 2,
        top: Math.min(from.y, to.y),
        bottom: Math.max(from.y, to.y),
        width: TRACK_WIDTH,
        height: Math.abs(to.y - from.y),
      } as DOMRect);
    } else if (from.y === to.y && from.x !== to.x) {
      obstacles.push({
        left: Math.min(from.x, to.x),
        right: Math.max(from.x, to.x),
        top: from.y - TRACK_WIDTH / 2,
        bottom: from.y + TRACK_WIDTH / 2,
        width: Math.abs(to.x - from.x),
        height: TRACK_WIDTH,
      } as DOMRect);
    }
  }

  return obstacles;
}
