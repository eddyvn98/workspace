import type { FreehandToolType, Position } from "../types/block";

export function isShapeTool(tool: FreehandToolType): boolean {
  return (
    tool === "line" ||
    tool === "cad_line" ||
    tool === "square" ||
    tool === "circle" ||
    tool === "arrow_line"
  );
}

export function generateShapePoints(
  tool: FreehandToolType,
  start: Position,
  end: Position
): Position[] {
  if (tool === "line" || tool === "cad_line") {
    return [start, end];
  }

  if (tool === "square") {
    return [
      { x: start.x, y: start.y },
      { x: end.x, y: start.y },
      { x: end.x, y: end.y },
      { x: start.x, y: end.y },
      { x: start.x, y: start.y },
    ];
  }

  if (tool === "circle") {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    const SEGMENTS = 32;
    const pts: Position[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2;
      pts.push({
        x: cx + rx * Math.cos(theta),
        y: cy + ry * Math.sin(theta),
      });
    }
    return pts;
  }

  if (tool === "arrow_line") {
    return [start, end];
  }

  return [start, end];
}

export function distToSegmentSquared(
  p: Position,
  v: Position,
  w: Position
): number {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (
    (p.x - (v.x + t * (w.x - v.x))) ** 2 +
    (p.y - (v.y + t * (w.y - v.y))) ** 2
  );
}

export function pathIntersectsPoint(
  points: Position[],
  targetPt: Position,
  radius: number
): boolean {
  if (!points || points.length === 0) return false;
  const radiusSq = radius * radius;

  if (points.length === 1) {
    const dx = points[0].x - targetPt.x;
    const dy = points[0].y - targetPt.y;
    return dx * dx + dy * dy <= radiusSq;
  }

  for (let i = 0; i < points.length - 1; i++) {
    if (distToSegmentSquared(targetPt, points[i], points[i + 1]) <= radiusSq) {
      return true;
    }
  }
  return false;
}
