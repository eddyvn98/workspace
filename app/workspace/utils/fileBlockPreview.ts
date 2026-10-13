import type { CanvasBlock } from "../types/block";

type FileData = CanvasBlock<"file">["data"];

/** Shared by FileBlock.tsx (which page to render), WorkspaceSelectionToolbar
 *  (whether to show the PDF page-nav/Pin/Extract toolbar) and
 *  useExtractPdfPages.ts — a native PDF or an Office doc that converted
 *  cleanly to a PDF stand-in (see lib/workspace/office-preview-conversion.ts)
 *  both page the same way. */
export function isPdfPreviewable(data: FileData): boolean {
  return data.mimeType === "application/pdf" || data.previewArtifact?.status === "READY";
}

/** Same download/preview URL derivation FileBlock.tsx already did inline —
 *  factored out so WorkspaceFileSelectionToolbar (Download button) and
 *  useExtractPdfPages (needs the same bytes pdfjs will parse) don't each
 *  reimplement it and drift from FileBlock's own preview logic. */
export function getFileUrls(boardId: string, data: FileData): { downloadUrl: string | null; previewUrl: string | null } {
  const { resourceId, mimeType, previewArtifact } = data;
  const downloadUrl = boardId && resourceId ? `/api/workspaces/${boardId}/resources/${resourceId}` : null;
  const rendersDirectly = mimeType === "application/pdf" || mimeType === "text/plain" || mimeType?.startsWith("image/");
  const previewUrl = rendersDirectly
    ? downloadUrl
    : previewArtifact?.status === "READY"
      ? `${downloadUrl}?variant=preview`
      : null;
  return { downloadUrl, previewUrl };
}
