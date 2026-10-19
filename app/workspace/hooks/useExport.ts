import { useCallback } from "react";
import { toast } from 'sonner';
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  type CanvasBlock,
  type Transform,
  resolveTransform,
} from "../types/block";
import { drawExportConnector, exportConnectorSvg } from "../utils/workspaceExportConnectors";
import { drawExportShape, exportShapeSvg } from "../utils/workspaceExportShapes";
import { getRotatedRectBounds } from "../utils/workspaceExportGeometry";
import { projectAttachedBlocks } from "../utils/tableAttachments";
import { drawWorkspaceDocExport, workspaceDocCanvasMarkup, workspaceDocCanvasHiddenIds } from '../utils/workspaceDocCanvasExport';
import {
  drawExportImage,
  drawExportTable,
  drawExportText,
  exportBlockExtrasSvg,
  getBlockRenderInfo,
} from "../utils/workspaceExportBlocks";

const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  w: 160,
  h: 80,
  rotation: 0,
  zIndex: 0,
};

const PADDING = 40;

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface BoundingBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function computeBoundingBox(blocks: CanvasBlock[]): BoundingBox | null {
  if (blocks.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const block of blocks) {
    const t = resolveTransform(block.transform, DEFAULT_TRANSFORM);
    const bounds = getRotatedRectBounds(t);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  return {
    minX,
    minY,
    width: maxX - minX + PADDING * 2,
    height: maxY - minY + PADDING * 2,
  };
}

function getOrderedBlocks(
  blocks: Record<string, CanvasBlock>,
  blockOrder: string[]
): CanvasBlock[] {
  const ordered: CanvasBlock[] = [];
  const seen = new Set<string>();
  for (const id of blockOrder) {
    if (blocks[id]) {
      ordered.push(blocks[id]);
      seen.add(id);
    }
  }
  for (const [id, block] of Object.entries(blocks)) {
    if (!seen.has(id)) ordered.push(block);
  }
  return ordered;
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function useExport() {
  const exportPng = useCallback(async (onlySelected: boolean = false) => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const { blocks, blockOrder, connectors, selectedBlockIds, title } = useWorkspaceStore.getState();
    const visualBlocks = projectAttachedBlocks(blocks);
    const hasSelection = selectedBlockIds.length > 0;
    const isSelectionScope = onlySelected && hasSelection;
    const hidden = workspaceDocCanvasHiddenIds(blocks, isSelectionScope ? selectedBlockIds : undefined);

    const orderedBlocks = getOrderedBlocks(visualBlocks, blockOrder).filter(
      (b) => !hidden.has(b.id) && (!isSelectionScope || selectedBlockIds.includes(b.id))
    );
    const exportedConnectors = isSelectionScope
      ? Object.fromEntries(
          Object.entries(connectors).filter(
            ([, c]) =>
              selectedBlockIds.includes(c.fromBlockId) && selectedBlockIds.includes(c.toBlockId)
          )
        )
      : connectors;
    const bbox = computeBoundingBox(orderedBlocks);
    if (!bbox || orderedBlocks.length === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(bbox.width);
    canvas.height = Math.ceil(bbox.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const block of orderedBlocks) {
      const b = getBlockRenderInfo(block, bbox);
      drawExportShape(ctx, b);
      try { if (await drawWorkspaceDocExport(ctx, block, blocks, b)) continue; }
      catch (error) { toast.error(error instanceof Error ? error.message : 'Document export failed.'); return; }
      await drawExportImage(ctx, b);
      drawExportTable(ctx, b);
      drawExportText(ctx, b);
    }

    for (const connector of Object.values(exportedConnectors)) drawExportConnector(ctx, connector, visualBlocks, bbox);

    const safeTitle = (title || "workspace").replace(/[^a-z0-9-_]+/gi, "-");
    const filename = isSelectionScope ? `${safeTitle}-selection.png` : `${safeTitle}.png`;
    try { triggerDownload(canvas.toDataURL("image/png"), filename); }
    catch { toast.error('This browser cannot export the document canvas. Use the document Print / Save PDF action.'); }
  }, []);

  const exportSelectionPng = useCallback(() => {
    exportPng(true);
  }, [exportPng]);

  const exportSvg = useCallback(async (onlySelected: boolean = false) => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const { blocks, blockOrder, connectors, selectedBlockIds, title } = useWorkspaceStore.getState();
    const visualBlocks = projectAttachedBlocks(blocks);
    const hasSelection = selectedBlockIds.length > 0;
    const isSelectionScope = onlySelected && hasSelection;
    const hidden = workspaceDocCanvasHiddenIds(blocks, isSelectionScope ? selectedBlockIds : undefined);

    const orderedBlocks = getOrderedBlocks(visualBlocks, blockOrder).filter(
      (b) => !hidden.has(b.id) && (!isSelectionScope || selectedBlockIds.includes(b.id))
    );
    const exportedConnectors = isSelectionScope
      ? Object.fromEntries(
          Object.entries(connectors).filter(
            ([, c]) =>
              selectedBlockIds.includes(c.fromBlockId) && selectedBlockIds.includes(c.toBlockId)
          )
        )
      : connectors;
    const bbox = computeBoundingBox(orderedBlocks);
    if (!bbox || orderedBlocks.length === 0) return;

    const svgElements: string[] = [
      `<rect width="${bbox.width}" height="${bbox.height}" fill="#ffffff"/>`,
    ];

    for (const block of orderedBlocks) {
      const b = getBlockRenderInfo(block, bbox);
      const shapeMarkup = exportShapeSvg(b, escapeXml);
      if (shapeMarkup) svgElements.push(shapeMarkup);
      try {
        const docMarkup = await workspaceDocCanvasMarkup(block, blocks, b);
        if (docMarkup) { svgElements.push(docMarkup); continue; }
      } catch (error) { toast.error(error instanceof Error ? error.message : 'Document export failed.'); return; }

      const extraMarkup = exportBlockExtrasSvg(b, escapeXml);
      if (extraMarkup) svgElements.push(extraMarkup);

      if (b.text) {
        const textTransform = ` transform="rotate(${b.rotation ?? 0} ${b.x + b.w / 2} ${b.y + b.h / 2})"`;
        if (b.isLink) {
          svgElements.push(
            `<text x="${b.x + 8}" y="${b.y + 20}"${textTransform} font-family="sans-serif" font-size="13" font-weight="500" fill="#2563eb">${escapeXml(b.text)}</text>`
          );
        } else {
          const tspans = b.text
            .split("\n")
            .map((line, idx) => `<tspan x="${b.x + 8}" y="${b.y + 20 + idx * 18}">${escapeXml(line)}</tspan>`)
            .join("");
          svgElements.push(
            `<text${textTransform} font-family="sans-serif" font-size="14" fill="#1e293b">${tspans}</text>`
          );
        }
      }
    }

    const connectorDefs: string[] = [];
    for (const connector of Object.values(exportedConnectors)) {
      const exported = exportConnectorSvg(connector, visualBlocks, bbox);
      if (!exported) continue;
      svgElements.push(exported.markup);
      connectorDefs.push(exported.defs);
    }

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bbox.width} ${bbox.height}" width="${bbox.width}" height="${bbox.height}">
  <defs>${connectorDefs.join("")}</defs>
  ${svgElements.join("\n  ")}
</svg>`;

    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const safeTitle = (title || "workspace").replace(/[^a-z0-9-_]+/gi, "-");
    const filename = isSelectionScope ? `${safeTitle}-selection.svg` : `${safeTitle}.svg`;
    triggerDownload(url, filename);
    URL.revokeObjectURL(url);
  }, []);

  return { exportPng, exportSelectionPng, exportSvg };
}
