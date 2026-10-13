import type { ShapeKind } from "../types/block";

export interface ExportShapeStyle {
  shapeKind?: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  bgColor: string;
  bgOpacity?: number;
  borderColor: string;
  borderWidth?: number;
  borderDash?: "solid" | "dashed" | "dotted";
  flipH?: boolean;
  flipV?: boolean;
  rotation?: number;
  pathPoints?: Array<{ x: number; y: number }>;
  pathTool?: string;
  pathStrokeColor?: string;
  pathStrokeWidth?: number;
  pathOpacity?: number;
  pathText?: string;
}

function normalizedKind(kind?: ShapeKind): ShapeKind {
  if (kind === "ellipse") return "circle";
  if (kind === "box") return "rounded_rect";
  if (kind === "cloud") return "cloud_rect";
  return kind ?? "rectangle";
}

function polygon(ctx: CanvasRenderingContext2D, points: Array<[number, number]>) {
  ctx.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
}

function drawPath(ctx: CanvasRenderingContext2D, kind: ShapeKind, w: number, h: number) {
  const radius = Math.min(w, h) / 2;
  if (kind === "circle" || kind === "oval") {
    ctx.ellipse(w / 2, h / 2, kind === "circle" ? radius : w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (kind === "diamond") {
    polygon(ctx, [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
  } else if (kind === "triangle") {
    polygon(ctx, [[w / 2, 0], [w, h], [0, h]]);
  } else if (kind === "hexagon") {
    polygon(ctx, [[w * .25, 0], [w * .75, 0], [w, h / 2], [w * .75, h], [w * .25, h], [0, h / 2]]);
  } else if (kind === "trapezoid") {
    polygon(ctx, [[w * .2, 0], [w * .8, 0], [w, h], [0, h]]);
  } else if (kind === "parallelogram" || kind === "slant") {
    polygon(ctx, [[w * .2, 0], [w, 0], [w * .8, h], [0, h]]);
  } else if (kind === "star") {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const distance = i % 2 === 0 ? Math.min(w, h) / 2 : Math.min(w, h) * .22;
      points.push([w / 2 + Math.cos(angle) * distance, h / 2 + Math.sin(angle) * distance]);
    }
    polygon(ctx, points);
  } else if (kind === "speech_bubble" || kind === "callout") {
    ctx.rect(0, 0, w, h * .8);
    ctx.moveTo(w * .15, h * .78);
    ctx.lineTo(w * .15, h);
    ctx.lineTo(w * .35, h * .8);
    ctx.closePath();
  } else if (kind === "cylinder") {
    ctx.ellipse(w / 2, h * .15, w / 2, h * .15, 0, 0, Math.PI * 2);
    ctx.moveTo(0, h * .15);
    ctx.lineTo(0, h * .85);
    ctx.ellipse(w / 2, h * .85, w / 2, h * .15, 0, 0, Math.PI);
    ctx.lineTo(w, h * .15);
  } else if (kind === "cloud" || kind === "cloud_rect") {
    ctx.moveTo(w * .2, h * .8);
    ctx.bezierCurveTo(0, h * .85, 0, h * .55, w * .2, h * .5);
    ctx.bezierCurveTo(w * .08, h * .15, w * .45, h * .05, w * .55, h * .3);
    ctx.bezierCurveTo(w * .75, h * .05, w, h * .2, w * .85, h * .48);
    ctx.bezierCurveTo(w * 1.05, h * .55, w * .9, h * .9, w * .7, h * .8);
    ctx.closePath();
  } else if (kind === "pill") {
    if (typeof ctx.roundRect === "function") ctx.roundRect(0, 0, w, h, radius);
    else ctx.rect(0, 0, w, h);
  } else {
    if (typeof ctx.roundRect === "function" && kind !== "rectangle" && kind !== "plain_text" && kind !== "underline") ctx.roundRect(0, 0, w, h, 6);
    else ctx.rect(0, 0, w, h);
  }
}

function drawExportFreehandPath(ctx: CanvasRenderingContext2D, shape: ExportShapeStyle) {
  const points = shape.pathPoints ?? [];
  if (points.length === 0) return;
  ctx.beginPath();
  const first = points[0];
  const last = points[points.length - 1];
  ctx.moveTo(first.x, first.y);
  if (shape.pathTool === "arrow_line" && points.length > 1) {
    ctx.lineTo(last.x, last.y);
    const angle = Math.atan2(last.y - first.y, last.x - first.x);
    const head = 15;
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x - head * Math.cos(angle - Math.PI / 6), last.y - head * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x - head * Math.cos(angle + Math.PI / 6), last.y - head * Math.sin(angle + Math.PI / 6));
  } else if (points.length === 2 || shape.pathTool === "line" || shape.pathTool === "polyline" || shape.pathTool === "cad_line") {
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  } else {
    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index];
      const next = points[index + 1];
      ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    if (points.length > 1) ctx.lineTo(last.x, last.y);
  }
  if (shape.pathTool === "square" || shape.pathTool === "circle") ctx.closePath();
  ctx.strokeStyle = shape.pathStrokeColor ?? "#1e293b";
  ctx.lineWidth = shape.pathStrokeWidth ?? 2;
  ctx.globalAlpha = shape.pathOpacity ?? 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (shape.pathTool === "arrow_line" && shape.pathText) {
    ctx.fillStyle = shape.pathStrokeColor ?? "#1e293b";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(shape.pathText, first.x, Math.max(14, first.y - 10));
  }
}

export function drawExportShape(ctx: CanvasRenderingContext2D, shape: ExportShapeStyle) {
  if (shape.pathPoints) {
    ctx.save();
    ctx.translate(shape.x + shape.w / 2, shape.y + shape.h / 2);
    ctx.rotate(((shape.rotation ?? 0) * Math.PI) / 180);
    ctx.translate(-shape.w / 2, -shape.h / 2);
    drawExportFreehandPath(ctx, shape);
    ctx.restore();
    return;
  }
  const kind = normalizedKind(shape.shapeKind);
  if (kind === "plain_text") return;
  ctx.save();
  ctx.translate(shape.x + shape.w / 2, shape.y + shape.h / 2);
  ctx.rotate(((shape.rotation ?? 0) * Math.PI) / 180);
  ctx.scale(shape.flipH ? -1 : 1, shape.flipV ? -1 : 1);
  ctx.translate(-shape.w / 2, -shape.h / 2);
  ctx.beginPath();
  drawPath(ctx, kind, shape.w, shape.h);
  ctx.fillStyle = shape.bgColor;
  ctx.globalAlpha = shape.bgOpacity ?? 1;
  ctx.fill();
  ctx.globalAlpha = 1;
  if (kind !== "underline") {
    ctx.lineWidth = shape.borderWidth ?? 1.5;
    ctx.strokeStyle = shape.borderColor;
    ctx.setLineDash(shape.borderDash === "dashed" ? [8, 5] : shape.borderDash === "dotted" ? [2, 4] : []);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, shape.h);
    ctx.lineTo(shape.w, shape.h);
    ctx.strokeStyle = shape.borderColor;
    ctx.stroke();
  }
  ctx.restore();
}

function svgPolygon(points: Array<[number, number]>) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

export function exportShapeSvg(shape: ExportShapeStyle, escape: (value: string) => string) {
  if (shape.pathPoints) {
    const points = shape.pathPoints;
    const first = points[0];
    const last = points[points.length - 1] ?? first;
    if (!first) return "";
    const stroke = escape(shape.pathStrokeColor ?? "#1e293b");
    const width = shape.pathStrokeWidth ?? 2;
    const opacity = shape.pathOpacity ?? 1;
    const pointString = points.map((point) => `${point.x + shape.x},${point.y + shape.y}`).join(" ");
    const transform = ` transform="rotate(${shape.rotation ?? 0} ${shape.x + shape.w / 2} ${shape.y + shape.h / 2})"`;
    const pathMarkup = shape.pathTool === "arrow_line"
      ? (() => {
        const angle = Math.atan2(last.y - first.y, last.x - first.x);
        const head = 15;
        const x1 = last.x - head * Math.cos(angle - Math.PI / 6);
        const y1 = last.y - head * Math.sin(angle - Math.PI / 6);
        const x2 = last.x - head * Math.cos(angle + Math.PI / 6);
        const y2 = last.y - head * Math.sin(angle + Math.PI / 6);
        return `<path d="M ${first.x + shape.x} ${first.y + shape.y} L ${last.x + shape.x} ${last.y + shape.y} M ${last.x + shape.x} ${last.y + shape.y} L ${x1 + shape.x} ${y1 + shape.y} M ${last.x + shape.x} ${last.y + shape.y} L ${x2 + shape.x} ${y2 + shape.y}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="round"${transform}/>`;
      })()
      : `<polyline points="${pointString}${shape.pathTool === "square" || shape.pathTool === "circle" ? ` ${first.x + shape.x},${first.y + shape.y}` : ""}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"${transform}/>`;
    const label = shape.pathTool === "arrow_line" && shape.pathText
      ? `<text x="${first.x + shape.x}" y="${Math.max(14, first.y - 10) + shape.y}" fill="${stroke}" font-family="sans-serif" font-size="14" font-weight="bold"${transform}>${escape(shape.pathText)}</text>`
      : "";
    return pathMarkup + label;
  }
  const kind = normalizedKind(shape.shapeKind);
  if (kind === "plain_text") return "";
  const fill = escape(shape.bgColor);
  const stroke = escape(shape.borderColor);
  const dash = shape.borderDash === "solid" || !shape.borderDash ? "" : ` stroke-dasharray="${shape.borderDash === "dashed" ? "8 5" : "2 4"}"`;
  const common = `fill="${fill}" fill-opacity="${shape.bgOpacity ?? 1}" stroke="${stroke}" stroke-width="${shape.borderWidth ?? 1.5}"${dash}`;
  const localTransform = ` transform="translate(${shape.x + shape.w / 2} ${shape.y + shape.h / 2}) rotate(${shape.rotation ?? 0}) scale(${shape.flipH ? -1 : 1} ${shape.flipV ? -1 : 1}) translate(${-shape.w / 2} ${-shape.h / 2})"`;
  if (kind === "circle" || kind === "oval") return `<ellipse cx="${shape.w / 2}" cy="${shape.h / 2}" rx="${kind === "circle" ? Math.min(shape.w, shape.h) / 2 : shape.w / 2}" ry="${shape.h / 2}" ${common}${localTransform}/>`;
  if (kind === "diamond") return `<polygon points="${svgPolygon([[shape.w / 2, 0], [shape.w, shape.h / 2], [shape.w / 2, shape.h], [0, shape.h / 2]])}" ${common}${localTransform}/>`;
  if (kind === "triangle") return `<polygon points="${svgPolygon([[shape.w / 2, 0], [shape.w, shape.h], [0, shape.h]])}" ${common}${localTransform}/>`;
  if (kind === "hexagon") return `<polygon points="${svgPolygon([[shape.w * .25, 0], [shape.w * .75, 0], [shape.w, shape.h / 2], [shape.w * .75, shape.h], [shape.w * .25, shape.h], [0, shape.h / 2]])}" ${common}${localTransform}/>`;
  if (kind === "trapezoid") return `<polygon points="${svgPolygon([[shape.w * .2, 0], [shape.w * .8, 0], [shape.w, shape.h], [0, shape.h]])}" ${common}${localTransform}/>`;
  if (kind === "parallelogram" || kind === "slant") return `<polygon points="${svgPolygon([[shape.w * .2, 0], [shape.w, 0], [shape.w * .8, shape.h], [0, shape.h]])}" ${common}${localTransform}/>`;
  if (kind === "star") {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const distance = i % 2 === 0 ? Math.min(shape.w, shape.h) / 2 : Math.min(shape.w, shape.h) * .22;
      points.push([shape.w / 2 + Math.cos(angle) * distance, shape.h / 2 + Math.sin(angle) * distance]);
    }
    return `<polygon points="${svgPolygon(points)}" ${common}${localTransform}/>`;
  }
  if (kind === "speech_bubble" || kind === "callout") return `<path d="M 0 0 H ${shape.w} V ${shape.h * .8} H ${shape.w * .35} L ${shape.w * .15} ${shape.h} V ${shape.h * .78} H 0 Z" ${common}${localTransform}/>`;
  if (kind === "cylinder") return `<path d="M 0 ${shape.h * .15} L 0 ${shape.h * .85} A ${shape.w / 2} ${shape.h * .15} 0 0 0 ${shape.w} ${shape.h * .85} L ${shape.w} ${shape.h * .15}" ${common}${localTransform}/><ellipse cx="${shape.w / 2}" cy="${shape.h * .15}" rx="${shape.w / 2}" ry="${shape.h * .15}" ${common}${localTransform}/>`;
  if (kind === "cloud" || kind === "cloud_rect") return `<path d="M ${shape.w * .2} ${shape.h * .8} C 0 ${shape.h * .85}, 0 ${shape.h * .55}, ${shape.w * .2} ${shape.h * .5} C ${shape.w * .08} ${shape.h * .15}, ${shape.w * .45} ${shape.h * .05}, ${shape.w * .55} ${shape.h * .3} C ${shape.w * .75} ${shape.h * .05}, ${shape.w} ${shape.h * .2}, ${shape.w * .85} ${shape.h * .48} C ${shape.w * 1.05} ${shape.h * .55}, ${shape.w * .9} ${shape.h * .9}, ${shape.w * .7} ${shape.h * .8} Z" ${common}${localTransform}/>`;
  if (kind === "sticky" || kind === "sticky_note") return `<path d="M 0 0 H ${shape.w} V ${shape.h * .8} L ${shape.w * .8} ${shape.h} H 0 Z" ${common}${localTransform}/>`;
  if (kind === "underline") return `<path d="M ${shape.x} ${shape.y + shape.h} L ${shape.x + shape.w} ${shape.y + shape.h}" fill="none" stroke="${stroke}" stroke-width="${shape.borderWidth ?? 1.5}"${dash}/>`;
  return `<rect x="0" y="0" width="${shape.w}" height="${shape.h}" rx="${kind === "pill" ? shape.h / 2 : kind === "rectangle" ? 0 : 6}" ${common}${localTransform}/>`;
}
