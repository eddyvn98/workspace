import type { Position } from "../types/block";

function getBounds(points: Position[]) {
  return points.reduce(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      minY: Math.min(result.minY, point.y),
      maxX: Math.max(result.maxX, point.x),
      maxY: Math.max(result.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
}

export function moveFreehandPoints(points: Position[], dx: number, dy: number): Position[] {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

/**
 * Resizes the legacy square/rectangle freehand shape from a dragged corner,
 * anchored on the opposite corner. Free by default (independent width/height);
 * pass lockAspect (held Ctrl/Cmd) to scale both dimensions by the same factor
 * so the shape keeps its original proportions instead of stretching.
 */
export function resizeFreehandSquare(
  points: Position[],
  cornerIndex: number,
  dx: number,
  dy: number,
  lockAspect = false
): Position[] {
  const corners = points.slice(0, 4);
  if (corners.length < 4) return points;

  const opposite = corners[(cornerIndex + 2) % 4];
  const dragged = corners[cornerIndex];
  const target = { x: dragged.x + dx, y: dragged.y + dy };
  const originalWidth = Math.max(1, Math.abs(dragged.x - opposite.x));
  const originalHeight = Math.max(1, Math.abs(dragged.y - opposite.y));

  let scaledTarget = target;
  if (lockAspect) {
    const scale = Math.max(
      Math.abs(target.x - opposite.x) / originalWidth,
      Math.abs(target.y - opposite.y) / originalHeight,
      8 / Math.max(originalWidth, originalHeight)
    );
    scaledTarget = {
      x: opposite.x + Math.sign(target.x - opposite.x || 1) * originalWidth * scale,
      y: opposite.y + Math.sign(target.y - opposite.y || 1) * originalHeight * scale,
    };
  } else {
    const minSize = 8;
    scaledTarget = {
      x: opposite.x + (Math.sign(target.x - opposite.x) || 1) * Math.max(minSize, Math.abs(target.x - opposite.x)),
      y: opposite.y + (Math.sign(target.y - opposite.y) || 1) * Math.max(minSize, Math.abs(target.y - opposite.y)),
    };
  }

  const minX = Math.min(opposite.x, scaledTarget.x);
  const maxX = Math.max(opposite.x, scaledTarget.x);
  const minY = Math.min(opposite.y, scaledTarget.y);
  const maxY = Math.max(opposite.y, scaledTarget.y);
  const nextCorners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  return points.map((point, index) => {
    if (index < 4) return nextCorners[index];
    if (index === points.length - 1) return nextCorners[0];
    return point;
  });
}

function ellipsePoints(cx: number, cy: number, radiusX: number, radiusY: number): Position[] {
  return Array.from({ length: 32 }, (_, index) => {
    const angle = (index / 32) * Math.PI * 2;
    return { x: cx + radiusX * Math.cos(angle), y: cy + radiusY * Math.sin(angle) };
  });
}

/**
 * Resizes the circle/ellipse freehand shape from one radius handle. Free by
 * default (only the dragged axis changes, so the shape can become an
 * ellipse); pass lockAspect (held Ctrl/Cmd) to apply the dragged axis'
 * radius to both axes, snapping the shape back to a nice perfect circle.
 */
export function resizeFreehandCircle(
  points: Position[],
  axis: "x" | "y",
  delta: number,
  lockAspect = false
): Position[] {
  const box = getBounds(points);
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  let radiusX = (box.maxX - box.minX) / 2;
  let radiusY = (box.maxY - box.minY) / 2;
  if (axis === "x") radiusX = Math.max(6, radiusX + delta);
  else radiusY = Math.max(6, radiusY + delta);
  if (lockAspect) {
    const radius = axis === "x" ? radiusX : radiusY;
    radiusX = radius;
    radiusY = radius;
  }
  return ellipsePoints(cx, cy, radiusX, radiusY);
}
