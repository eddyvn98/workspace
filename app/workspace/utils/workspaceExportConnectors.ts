import type { CanvasBlock, Transform } from "../types/block";
import type { AnchorSide, CanvasConnector } from "../types/connector";
import { getConnectorVisualStyle, lineDashArray } from "../connectors/connectorStyle";

type Point = { x: number; y: number };
type Bounds = { minX: number; minY: number };
type ExportPath = { points: Point[]; svg: string };

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

function transform(block: CanvasBlock) {
  return { ...DEFAULT_TRANSFORM, ...block.transform };
}

function center(block: CanvasBlock): Point {
  const t = transform(block);
  return { x: t.x + t.w / 2, y: t.y + t.h / 2 };
}

function sidePoint(block: CanvasBlock, side: AnchorSide | undefined, toward: Point): Point {
  const t = transform(block);
  const c = center(block);
  const resolved = side && side !== "center" ? side :
    Math.abs(toward.x - c.x) >= Math.abs(toward.y - c.y)
      ? (toward.x >= c.x ? "right" : "left")
      : (toward.y >= c.y ? "bottom" : "top");
  if (resolved === "top") return { x: c.x, y: t.y };
  if (resolved === "bottom") return { x: c.x, y: t.y + t.h };
  if (resolved === "left") return { x: t.x, y: c.y };
  return { x: t.x + t.w, y: c.y };
}

function translate(point: Point, bounds: Bounds): Point {
  return { x: point.x - bounds.minX + 40, y: point.y - bounds.minY + 40 };
}

function orthogonalPoints(start: Point, end: Point): Point[] {
  if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  const midY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

function curvedPath(start: Point, end: Point): string {
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const distance = Math.max(30, (horizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y)) * 0.45);
  const c1 = { x: start.x + (horizontal ? Math.sign(end.x - start.x) * distance : 0), y: start.y + (horizontal ? 0 : Math.sign(end.y - start.y) * distance) };
  const c2 = { x: end.x - (horizontal ? Math.sign(end.x - start.x) * distance : 0), y: end.y - (horizontal ? 0 : Math.sign(end.y - start.y) * distance) };
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

function pointsPath(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

export function getExportConnectorPath(connector: CanvasConnector, blocks: Record<string, CanvasBlock>, bounds: Bounds): ExportPath | null {
  const from = blocks[connector.fromBlockId];
  const to = blocks[connector.toBlockId];
  if (!from || !to) return null;
  const fromCenter = center(from);
  const toCenter = center(to);
  const start = sidePoint(from, connector.fromSide, toCenter);
  const end = sidePoint(to, connector.toSide, fromCenter);
  const waypoints = connector.waypoints?.map((point) => translate(point, bounds)) ?? [];
  const translatedStart = translate(start, bounds);
  const translatedEnd = translate(end, bounds);
  if (connector.trunkAxis !== undefined && connector.fromSide && connector.toSide) {
    // Same live-tracking bend as computeConnectorGeometry: the trunk's fixed
    // axis, bent at each endpoint's own (already-translated) coordinate.
    const horizontal = connector.fromSide === "left" || connector.fromSide === "right";
    const trunk = translate(horizontal ? { x: connector.trunkAxis, y: 0 } : { x: 0, y: connector.trunkAxis }, bounds);
    const points = horizontal
      ? [translatedStart, { x: trunk.x, y: translatedStart.y }, { x: trunk.x, y: translatedEnd.y }, translatedEnd]
      : [translatedStart, { x: translatedStart.x, y: trunk.y }, { x: translatedEnd.x, y: trunk.y }, translatedEnd];
    return { points, svg: pointsPath(points) };
  }
  if (waypoints.length > 0) {
    const points = [translatedStart, ...waypoints, translatedEnd];
    return { points, svg: pointsPath(points) };
  }
  if (connector.lineType === "curved") {
    return { points: [translatedStart, translatedEnd], svg: curvedPath(translatedStart, translatedEnd) };
  }
  const points = connector.lineType === "orthogonal" ? orthogonalPoints(translatedStart, translatedEnd) : [translatedStart, translatedEnd];
  return { points, svg: pointsPath(points) };
}

function arrow(ctx: CanvasRenderingContext2D, point: Point, previous: Point, style: string, width: number) {
  if (style === "none") return;
  const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
  const size = Math.max(6, width * 3);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle);
  ctx.strokeStyle = ctx.fillStyle;
  if (style === "dot") {
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(3, width), 0, Math.PI * 2);
    ctx.fill();
  } else if (style === "slash") {
    ctx.beginPath();
    ctx.moveTo(0, -size / 2);
    ctx.lineTo(0, size / 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size / 2);
    ctx.lineTo(-size, size / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawExportConnector(ctx: CanvasRenderingContext2D, connector: CanvasConnector, blocks: Record<string, CanvasBlock>, bounds: Bounds) {
  const path = getExportConnectorPath(connector, blocks, bounds);
  if (!path) return;
  const style = getConnectorVisualStyle(connector);
  const points = path.points;
  ctx.save();
  ctx.strokeStyle = style.color ?? "#94a3b8";
  ctx.globalAlpha = style.lineOpacity / 100;
  ctx.lineWidth = style.lineWidth;
  const dash = lineDashArray(style.linePattern, style.lineWidth);
  ctx.setLineDash(dash ? dash.split(" ").map(Number) : []);
  ctx.beginPath();
  if (connector.lineType === "curved" && points.length === 2) {
    const start = points[0], end = points[1];
    const distance = Math.max(30, Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? Math.abs(end.x - start.x) * 0.45 : Math.abs(end.y - start.y) * 0.45);
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    ctx.moveTo(start.x, start.y);
    ctx.bezierCurveTo(start.x + (horizontal ? Math.sign(end.x - start.x) * distance : 0), start.y + (horizontal ? 0 : Math.sign(end.y - start.y) * distance), end.x - (horizontal ? Math.sign(end.x - start.x) * distance : 0), end.y - (horizontal ? 0 : Math.sign(end.y - start.y) * distance), end.x, end.y);
  } else {
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  arrow(ctx, points[0], points[1], style.arrowStart, style.lineWidth);
  arrow(ctx, points[points.length - 1], points[points.length - 2], style.arrowEnd, style.lineWidth);
  if (connector.label) {
    const midpoint = points[Math.floor((points.length - 1) / 2)];
    ctx.fillStyle = style.color ?? "#475569";
    ctx.font = "12px sans-serif";
    ctx.fillText(connector.label, midpoint.x + 4, midpoint.y - 4);
  }
  ctx.restore();
}

export function exportConnectorSvg(connector: CanvasConnector, blocks: Record<string, CanvasBlock>, bounds: Bounds): { markup: string; defs: string } | null {
  const path = getExportConnectorPath(connector, blocks, bounds);
  if (!path) return null;
  const style = getConnectorVisualStyle(connector);
  const dash = lineDashArray(style.linePattern, style.lineWidth);
  const attrs = [`fill="none"`, `stroke="${style.color ?? "#94a3b8"}"`, `stroke-width="${style.lineWidth}"`, `stroke-opacity="${style.lineOpacity / 100}"`, dash ? `stroke-dasharray="${dash}"` : ""]
    .filter(Boolean).join(" ");
  const defs: string[] = [];
  const marker = (name: string, markerStyle: string, reverse = false) => {
    if (markerStyle === "none") return "";
    const id = `workspace-${connector.id}-${name}`;
    if (markerStyle === "dot") defs.push(`<marker id="${id}" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><circle cx="4" cy="4" r="3" fill="${style.color ?? "#94a3b8"}"/></marker>`);
    else if (markerStyle === "slash") defs.push(`<marker id="${id}" markerWidth="8" markerHeight="12" refX="4" refY="6" orient="auto"><path d="M4 1V11" stroke="${style.color ?? "#94a3b8"}" stroke-width="2"/></marker>`);
    else defs.push(`<marker id="${id}" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto${reverse ? "-start-reverse" : ""}"><path d="M0 0L8 4L0 8Z" fill="${style.color ?? "#94a3b8"}"/></marker>`);
    return ` marker-${name}="url(#${id})"`;
  };
  const markerAttrs = `${marker("start", style.arrowStart, true)}${marker("end", style.arrowEnd)}`;
  const label = connector.label ? `<text x="${path.points[Math.floor((path.points.length - 1) / 2)].x + 4}" y="${path.points[Math.floor((path.points.length - 1) / 2)].y - 4}" font-family="sans-serif" font-size="12" fill="${style.color ?? "#475569"}">${escapeXml(connector.label)}</text>` : "";
  return { markup: `<path d="${path.svg}" ${attrs}${markerAttrs}/>${label}`, defs: defs.join("") };
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
