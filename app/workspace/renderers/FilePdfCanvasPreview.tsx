"use client";

import React, { useEffect, useRef, useState } from "react";
import { loadPdfDocument, renderPdfPageToCanvas } from "../utils/pdfPages";

export interface FilePdfCanvasPreviewProps {
  url: string;
  page: number;
  /** Fired once per URL, as soon as pdfjs knows the document's page count —
   *  feeds WorkspaceFileSelectionToolbar's "X of N" and Pin/Extract bounds. */
  onPageCount: (count: number) => void;
  /** Fired with height/width once a page has actually rendered, so
   *  FileBlock.tsx can snap the block's own frame to match the PDF's real
   *  aspect ratio instead of leaving it at whatever guess-sized box the
   *  drop created it with (a fixed portrait default doesn't fit a 16:9
   *  slide deck, and the canvas below stretches to fill its box). */
  onPageSize?: (ratio: number) => void;
}

/** Renders one PDF page into a `<canvas>` via pdfjs-dist, replacing the
 *  previous native-iframe-viewer approach (FileBlock.tsx used to rely on
 *  `#page=N` URL fragments, which the browser's built-in PDF plugin honors
 *  inconsistently and never exposes a page count for). Mounted lazily by
 *  FileBlock.tsx — same "don't eagerly load every file block's viewer"
 *  guard as before. */
export const FilePdfCanvasPreview: React.FC<FilePdfCanvasPreviewProps> = ({ url, page, onPageCount, onPageSize }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void loadPdfDocument(url)
      .then((doc) => {
        if (cancelled) return;
        onPageCount(doc.numPages);
        const clampedPage = Math.min(Math.max(page, 1), doc.numPages);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const displayWidth = canvas.parentElement?.clientWidth || canvas.clientWidth || 320;
        return renderPdfPageToCanvas(doc, clampedPage, canvas, displayWidth);
      })
      .then((size) => {
        if (!cancelled && size) onPageSize?.(size.height / size.width);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to render PDF");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, page]);

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: "11px" }}>
        {error}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
    />
  );
};

export default FilePdfCanvasPreview;
