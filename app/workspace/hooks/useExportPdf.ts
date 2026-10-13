import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { type CanvasBlock, type Transform, resolveTransform } from "../types/block";
import { drawExportConnector } from "../utils/workspaceExportConnectors";
import { drawExportShape } from "../utils/workspaceExportShapes";
import { projectAttachedBlocks } from "../utils/tableAttachments";
import { getRotatedRectBounds } from "../utils/workspaceExportGeometry";
import { drawExportImage, drawExportTable, drawExportText, getBlockRenderInfo } from "../utils/workspaceExportBlocks";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
const PADDING = 40;

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
  return { minX, minY, width: maxX - minX + PADDING * 2, height: maxY - minY + PADDING * 2 };
}

function getOrderedBlocks(blocks: Record<string, CanvasBlock>, blockOrder: string[]): CanvasBlock[] {
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

function stringToUint8Array(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

function buildSingleImagePdf(
  jpegBytes: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number
): Blob {
  const chunks: BlobPart[] = [];
  let byteOffset = 0;

  const pushString = (str: string) => {
    const bytes = stringToUint8Array(str);
    chunks.push(bytes as unknown as BlobPart);
    byteOffset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes as unknown as BlobPart);
    byteOffset += bytes.length;
  };

  // PDF-1.4 header
  pushBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const offsets: number[] = [];
  offsets[1] = byteOffset;
  pushString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  offsets[2] = byteOffset;
  pushString("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  offsets[3] = byteOffset;
  pushString(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  offsets[4] = byteOffset;
  pushString(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushString("\nendstream\nendobj\n");

  const contentStream = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  offsets[5] = byteOffset;
  pushString(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

  const xrefOffset = byteOffset;
  pushString("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++) {
    pushString(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
  }

  pushString(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function useExportPdf() {
  const exportPdf = useCallback(async () => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const { blocks, blockOrder, connectors, selectedBlockIds } = useWorkspaceStore.getState();
    const visualBlocks = projectAttachedBlocks(blocks);
    const hasSelection = selectedBlockIds.length > 0;
    const orderedBlocks = getOrderedBlocks(visualBlocks, blockOrder).filter(
      (b) => !hasSelection || selectedBlockIds.includes(b.id)
    );
    const exportedConnectors = hasSelection
      ? Object.fromEntries(
          Object.entries(connectors).filter(
            ([, c]) =>
              selectedBlockIds.includes(c.fromBlockId) && selectedBlockIds.includes(c.toBlockId)
          )
        )
      : connectors;
    const bbox = computeBoundingBox(orderedBlocks);
    if (!bbox || orderedBlocks.length === 0) return;

    const scale = 2;
    const canvas = document.createElement("canvas");
    const exportWidth = Math.ceil(bbox.width);
    const exportHeight = Math.ceil(bbox.height);
    canvas.width = exportWidth * scale;
    canvas.height = exportHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    for (const block of orderedBlocks) {
      const b = getBlockRenderInfo(block, bbox);
      drawExportShape(ctx, b);
      await drawExportImage(ctx, b);
      drawExportTable(ctx, b);
      drawExportText(ctx, b);
    }

    for (const connector of Object.values(exportedConnectors)) drawExportConnector(ctx, connector, visualBlocks, bbox);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const base64 = dataUrl.split(",")[1];
    const binaryStr = atob(base64);
    const jpegBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      jpegBytes[i] = binaryStr.charCodeAt(i);
    }

    const pdfBlob = buildSingleImagePdf(jpegBytes, canvas.width, canvas.height, exportWidth, exportHeight);
    const pdfUrl = URL.createObjectURL(pdfBlob);
    triggerDownload(pdfUrl, "workspace-export.pdf");
    URL.revokeObjectURL(pdfUrl);
  }, []);

  return { exportPdf };
}
