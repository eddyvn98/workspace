import type { CanvasBlock, BlockDataMap, ShapeKind, Transform } from "../types/block";
import { resolveTransform } from "../types/block";
import {
  isTableCellContent,
  tableCellContentToPlainText,
  textTableCellContent,
} from "../components/table/tableCellContent";

export interface ExportBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface ExportBlockInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  isEllipse: boolean;
  shapeKind?: ShapeKind;
  bgColor: string;
  bgOpacity?: number;
  borderColor: string;
  borderWidth?: number;
  borderDash?: "solid" | "dashed" | "dotted";
  flipH?: boolean;
  flipV?: boolean;
  rotation?: number;
  text: string;
  isLink: boolean;
  imageUrl?: string;
  imageFit?: "cover" | "contain";
  tableData?: BlockDataMap["table"];
  pathPoints?: Array<{ x: number; y: number }>;
  pathTool?: string;
  pathStrokeColor?: string;
  pathStrokeWidth?: number;
  pathOpacity?: number;
  pathText?: string;
}

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

export function getBlockRenderInfo(block: CanvasBlock, bounds: ExportBounds): ExportBlockInfo {
  const transform = resolveTransform(block.transform, DEFAULT_TRANSFORM);
  const data = block.data as Record<string, unknown>;
  const shapeKind = data.shapeKind as ShapeKind | undefined;
  const pathData = block.type === "path"
    ? data as { points?: Array<{ x: number; y: number }>; tool?: string; strokeColor?: string; strokeWidth?: number; opacity?: number; text?: string }
    : undefined;
  const text = block.type === "text"
    ? typeof data.markdown === "string" ? data.markdown : ""
    : block.type === "shape"
      ? typeof data.label === "string" ? data.label : ""
      : block.type === "link"
        ? (typeof data.title === "string" && data.title) || (typeof data.url === "string" && data.url) || "Untitled Link"
        : "";

  return {
    x: transform.x - bounds.minX + 40,
    y: transform.y - bounds.minY + 40,
    w: transform.w,
    h: transform.h,
    isEllipse: block.type === "shape" && ["ellipse", "oval", "circle"].includes(shapeKind ?? ""),
    shapeKind: block.type === "shape" ? shapeKind : undefined,
    bgColor: block.style?.backgroundColor ?? (block.type === "shape" ? "#e2e8f0" : "#ffffff"),
    bgOpacity: block.style?.backgroundOpacity,
    borderColor: block.style?.borderColor ?? "#94a3b8",
    borderWidth: block.style?.borderWidth,
    borderDash: block.style?.borderDash,
    flipH: block.style?.flipH,
    flipV: block.style?.flipV,
    rotation: transform.rotation,
    text,
    isLink: block.type === "link",
    imageUrl: block.type === "image" && typeof data.url === "string" ? data.url : undefined,
    imageFit: block.type === "image" && data.fit === "contain" ? "contain" : "cover",
    tableData: block.type === "table" ? block.data as BlockDataMap["table"] : undefined,
    pathPoints: pathData?.points,
    pathTool: pathData?.tool,
    pathStrokeColor: pathData?.strokeColor,
    pathStrokeWidth: pathData?.strokeWidth,
    pathOpacity: pathData?.opacity,
    pathText: pathData?.text,
  };
}

export function drawExportText(ctx: CanvasRenderingContext2D, block: ExportBlockInfo): void {
  if (!block.text) return;
  ctx.save();
  ctx.translate(block.x + block.w / 2, block.y + block.h / 2);
  ctx.rotate(((block.rotation ?? 0) * Math.PI) / 180);
  ctx.translate(-(block.x + block.w / 2), -(block.y + block.h / 2));
  ctx.beginPath();
  ctx.rect(block.x + 4, block.y + 4, Math.max(0, block.w - 8), Math.max(0, block.h - 8));
  ctx.clip();
  ctx.fillStyle = block.isLink ? "#2563eb" : "#1e293b";
  ctx.font = block.isLink ? "13px sans-serif" : "14px sans-serif";
  ctx.textBaseline = "top";
  block.text.split("\n").forEach((line, index) => ctx.fillText(line, block.x + 8, block.y + 8 + index * 18));
  ctx.restore();
}

function tableCellText(data: BlockDataMap["table"], row: number, col: number): string {
  const rich = data.cellContents?.[row]?.[col];
  if (isTableCellContent(rich)) return tableCellContentToPlainText(rich);
  return textTableCellContent(data.cells?.[row]?.[col] ?? "").blocks.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
}

function tableMetrics(data: BlockDataMap["table"], width: number, height: number) {
  const rows = Math.max(1, data.rows || 1);
  const cols = Math.max(1, data.cols || 1);
  const rowWeights = data.rowWeights?.length === rows ? data.rowWeights : Array(rows).fill(1);
  const colWeights = data.colWeights?.length === cols ? data.colWeights : Array(cols).fill(1);
  const rowSum = rowWeights.reduce((sum, value) => sum + value, 0) || 1;
  const colSum = colWeights.reduce((sum, value) => sum + value, 0) || 1;
  return {
    rows,
    cols,
    rowHeights: rowWeights.map((value) => height * value / rowSum),
    colWidths: colWeights.map((value) => width * value / colSum),
  };
}

export function drawExportTable(ctx: CanvasRenderingContext2D, block: ExportBlockInfo): void {
  if (!block.tableData) return;
  const metrics = tableMetrics(block.tableData, block.w, block.h);
  ctx.save();
  ctx.translate(block.x + block.w / 2, block.y + block.h / 2);
  ctx.rotate(((block.rotation ?? 0) * Math.PI) / 180);
  ctx.translate(-(block.x + block.w / 2), -(block.y + block.h / 2));
  let y = block.y;
  for (let row = 0; row < metrics.rows; row += 1) {
    let x = block.x;
    for (let col = 0; col < metrics.cols; col += 1) {
      const width = metrics.colWidths[col];
      const height = metrics.rowHeights[row];
      ctx.fillStyle = block.tableData.headerRow && row === 0 ? "#f8fafc" : "transparent";
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);
      const text = tableCellText(block.tableData, row, col);
      if (text) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 4, y + 3, Math.max(0, width - 8), Math.max(0, height - 6));
        ctx.clip();
        const align = block.tableData.cellAlign?.[row]?.[col] ?? "left";
        const fontSize = block.tableData.cellFontSizes?.[row]?.[col] ?? 14;
        ctx.font = `${block.tableData.headerRow && row === 0 ? "600 " : ""}${fontSize}px sans-serif`;
        ctx.fillStyle = "#0f172a";
        ctx.textBaseline = "top";
        const lines = text.split("\n");
        lines.forEach((line, index) => {
          const textWidth = ctx.measureText(line).width;
          const textX = align === "center" ? x + (width - textWidth) / 2 : align === "right" ? x + width - textWidth - 4 : x + 4;
          ctx.fillText(line, textX, y + 4 + index * Math.max(16, fontSize * 1.4));
        });
        ctx.restore();
      }
      x += width;
    }
    y += metrics.rowHeights[row];
  }
  ctx.restore();
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timeout = window.setTimeout(() => finish(null), 5000);
    image.onload = () => { window.clearTimeout(timeout); finish(image); };
    image.onerror = () => { window.clearTimeout(timeout); finish(null); };
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

export async function drawExportImage(ctx: CanvasRenderingContext2D, block: ExportBlockInfo): Promise<void> {
  if (!block.imageUrl) return;
  const image = await loadImage(block.imageUrl);
  if (!image) return;
  const inset = 1;
  const targetW = Math.max(0, block.w - inset * 2);
  const targetH = Math.max(0, block.h - inset * 2);
  const imageRatio = image.naturalWidth / Math.max(1, image.naturalHeight);
  const targetRatio = targetW / Math.max(1, targetH);
  const drawW = block.imageFit === "contain" ? (imageRatio > targetRatio ? targetW : targetH * imageRatio) : imageRatio > targetRatio ? targetH * imageRatio : targetW;
  const drawH = block.imageFit === "contain" ? (imageRatio > targetRatio ? targetW / imageRatio : targetH) : imageRatio > targetRatio ? targetH : targetW / imageRatio;
  ctx.save();
  ctx.translate(block.x + block.w / 2, block.y + block.h / 2);
  ctx.rotate(((block.rotation ?? 0) * Math.PI) / 180);
  ctx.translate(-(block.x + block.w / 2), -(block.y + block.h / 2));
  ctx.beginPath();
  ctx.rect(block.x + inset, block.y + inset, targetW, targetH);
  ctx.clip();
  ctx.drawImage(image, block.x + (block.w - drawW) / 2, block.y + (block.h - drawH) / 2, drawW, drawH);
  ctx.restore();
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function exportBlockExtrasSvg(block: ExportBlockInfo, escape: (value: string) => string = xmlEscape): string {
  if (block.imageUrl) {
    const preserve = block.imageFit === "contain" ? "xMidYMid meet" : "xMidYMid slice";
    const transform = `rotate(${block.rotation ?? 0} ${block.x + block.w / 2} ${block.y + block.h / 2})`;
    return `<image href="${escape(block.imageUrl)}" x="${block.x + 1}" y="${block.y + 1}" width="${Math.max(0, block.w - 2)}" height="${Math.max(0, block.h - 2)}" preserveAspectRatio="${preserve}" transform="${transform}"/>`;
  }
  if (!block.tableData) return "";
  const metrics = tableMetrics(block.tableData, block.w, block.h);
  const cells: string[] = [];
  let y = block.y;
  for (let row = 0; row < metrics.rows; row += 1) {
    let x = block.x;
    for (let col = 0; col < metrics.cols; col += 1) {
      const width = metrics.colWidths[col];
      const height = metrics.rowHeights[row];
      const fill = block.tableData.headerRow && row === 0 ? "#f8fafc" : "transparent";
      const text = tableCellText(block.tableData, row, col);
      const fontSize = block.tableData.cellFontSizes?.[row]?.[col] ?? 14;
      const align = block.tableData.cellAlign?.[row]?.[col] ?? "left";
      const textX = align === "center" ? x + width / 2 : align === "right" ? x + width - 4 : x + 4;
      cells.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="#cbd5e1" stroke-width="1"/>`);
      if (text) cells.push(`<text x="${textX}" y="${y + Math.min(height - 4, fontSize + 4)}" text-anchor="${align === "left" ? "start" : align}" font-family="sans-serif" font-size="${fontSize}" fill="#0f172a">${escape(text.split("\n")[0])}</text>`);
      x += width;
    }
    y += metrics.rowHeights[row];
  }
  const transform = `rotate(${block.rotation ?? 0} ${block.x + block.w / 2} ${block.y + block.h / 2})`;
  return `<g transform="${transform}">${cells.join("")}</g>`;
}
