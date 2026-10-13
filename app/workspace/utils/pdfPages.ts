"use client";

/** Client-side PDF page rasterization, shared by the live canvas preview
 *  (FilePdfCanvasPreview.tsx) and the "Extract to blocks" action
 *  (useExtractPdfPages.ts) so both draw from the same parsed document
 *  instead of re-fetching/re-parsing the same PDF bytes twice. */
import { pdfjs } from "./pdfjsSetup";
import type { PDFDocumentProxy } from "pdfjs-dist";

const documentCache = new Map<string, Promise<PDFDocumentProxy>>();

/** Cached by URL — the preview canvas and the Extract action both call this
 *  for the same `previewUrl` and should share one parse, not trigger two
 *  full downloads of the file's bytes. */
export function loadPdfDocument(url: string): Promise<PDFDocumentProxy> {
  let cached = documentCache.get(url);
  if (!cached) {
    cached = pdfjs.getDocument(url).promise;
    documentCache.set(url, cached);
    cached.catch(() => documentCache.delete(url));
  }
  return cached;
}

export interface PdfPageSize {
  width: number;
  height: number;
}

/** Renders one page into a supplied `<canvas>` at a given display width,
 *  preserving the page's own aspect ratio. Returns the page's rendered size
 *  so callers can size the surrounding block/frame to match. */
export async function renderPdfPageToCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  displayWidth: number
): Promise<PdfPageSize> {
  const page = await doc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = displayWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) return { width: viewport.width, height: viewport.height };
  await page.render({ canvasContext: context, viewport }).promise;
  return { width: viewport.width, height: viewport.height };
}

/** Renders one page to an offscreen canvas and resolves a PNG blob — used by
 *  Extract to turn every page into an uploadable image without ever
 *  attaching an offscreen canvas to the DOM. */
export async function renderPdfPageToBlob(
  doc: PDFDocumentProxy,
  pageNumber: number,
  displayWidth: number
): Promise<{ blob: Blob; size: PdfPageSize }> {
  const canvas = document.createElement("canvas");
  const size = await renderPdfPageToCanvas(doc, pageNumber, canvas, displayWidth);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error(`Failed to rasterize page ${pageNumber}`);
  return { blob, size };
}
