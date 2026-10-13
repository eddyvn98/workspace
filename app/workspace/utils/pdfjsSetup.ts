/** One-time pdfjs-dist setup shared by every client-side PDF-page renderer
 *  (FilePdfCanvasPreview.tsx, useExtractPdfPages.ts). pdfjs needs an explicit
 *  worker script; `new URL(..., import.meta.url)` is the standard Next.js/
 *  webpack5 way to point it at the copy pdfjs-dist ships, without a CDN
 *  dependency or a manual public/ file copy. */
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export { pdfjs };
