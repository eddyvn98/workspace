import type { Position } from "../types/block";

function polygonPath(points: Position[]): string {
  if (points.length === 0) return "";
  return `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} Z`;
}

/** Matches the legacy freehand renderer without importing the legacy component. */
export function buildFreehandPath(
  points: Position[],
  isStraight?: boolean,
  tool?: string
): string {
  if (!points || points.length === 0) return "";
  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x} ${point.y} L ${point.x + 0.1} ${point.y + 0.1}`;
  }

  const first = points[0];
  const last = points[points.length - 1];

  if (tool === "square") return polygonPath(points);

  if (tool === "circle") {
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = (maxX - minX) / 2;
    const ry = (maxY - minY) / 2;
    if (rx === 0 || ry === 0) return "";
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`;
  }

  if (tool === "arrow_line") {
    const angle = Math.atan2(last.y - first.y, last.x - first.x);
    const headLength = 15;
    const left = {
      x: last.x - headLength * Math.cos(angle - Math.PI / 6),
      y: last.y - headLength * Math.sin(angle - Math.PI / 6),
    };
    const right = {
      x: last.x - headLength * Math.cos(angle + Math.PI / 6),
      y: last.y - headLength * Math.sin(angle + Math.PI / 6),
    };
    return `M ${first.x} ${first.y} L ${last.x} ${last.y} M ${last.x} ${last.y} L ${left.x} ${left.y} M ${last.x} ${last.y} L ${right.x} ${right.y}`;
  }

  if (isStraight || tool === "cad_line" || points.length === 2) {
    return `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")}`;
  }

  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    path += ` Q ${current.x} ${current.y}, ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
  }
  return `${path} L ${last.x} ${last.y}`;
}
