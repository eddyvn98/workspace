"use client";

import React, { useRef, useState } from "react";
import { Download, FileIcon, FileSpreadsheet, FileText, ImageIcon, Play, Presentation } from "lucide-react";
import { registerBlockRenderer, type BlockRendererProps } from "./registry";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { applyBackgroundOpacity } from "../utils/colorOpacity";
import { getFileUrls, isPdfPreviewable } from "../utils/fileBlockPreview";
import { FilePdfCanvasPreview } from "./FilePdfCanvasPreview";
import { resolveTransform, type Transform } from "../types/block";

const FALLBACK_TRANSFORM: Transform = { x: 0, y: 0, w: 220, h: 280, rotation: 0, zIndex: 0 };

function formatBytes(raw: string): string {
  const bytes = Number(raw);
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function iconFor(mimeType: string): React.ReactNode {
  const props = { size: 20, color: "#64748b" };
  if (mimeType.startsWith("image/")) return <ImageIcon {...props} />;
  if (mimeType === "application/pdf" || mimeType.includes("word")) return <FileText {...props} />;
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return <FileSpreadsheet {...props} />;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return <Presentation {...props} />;
  return <FileIcon {...props} />;
}

/**
 * Renders a WorkspaceResource by reference (see types/block.ts's `file`
 * payload) — never the bytes themselves. This is the first and, for now,
 * only reader of the resource/version model added in
 * .claude/specs/active/workspace-resource-roadmap.md's Checkpoint 5-7: a
 * resource created via createResource() had no block pointing at it until
 * this renderer + useFileDropFromOS.ts existed.
 */
export const FileBlock: React.FC<BlockRendererProps<"file">> = ({ block, isSelected }) => {
  const boardId = useWorkspaceStore((s) => s.boardId);
  const filePreviewPage = useWorkspaceStore((s) => s.filePreviewPage[block.id]);
  const setFilePreviewPageCount = useWorkspaceStore((s) => s.setFilePreviewPageCount);
  const updateBlockTransform = useWorkspaceStore((s) => s.updateBlockTransform);
  // Only auto-fit the block to the PDF's own aspect ratio once — after that,
  // a user-driven resize must stick, not get overwritten on the next page
  // turn (which can carry a different aspect for an odd PDF).
  const hasAutoSizedRef = useRef(false);
  const { filename, mimeType, sizeBytes, previewArtifact, range } = block.data ?? {};
  // Lifecycle (see workspace-resource-architecture-plan.md's "missing
  // lifecycle" gap): a preview iframe is a full embedded document viewer, not a cheap
  // image — mounting one per file block unconditionally is how a board with
  // several of them starts throwing ERR_INSUFFICIENT_RESOURCES. Loaded only
  // on explicit click, same "thumbnail → activate on interaction" pattern
  // canvas tools (Miro, Figma) use for embeds; stays mounted afterward rather
  // than tearing down on deselect, since re-fetching repeatedly is its own
  // waste and a board realistically has only a few *opened* previews at once.
  // A PDF-capable block skips this gate entirely — a pdfjs canvas render is
  // cheap next to an embedded iframe document viewer, and the reference
  // widget this is modeled on shows the page immediately on drop, with no
  // "click to preview" step at all.
  const [clicked, setClicked] = useState(false);
  const backgroundColor = applyBackgroundOpacity(
    block.style?.backgroundColor ?? "#ffffff",
    block.style?.backgroundOpacity ?? 1
  );
  const borderColor = block.style?.borderColor ?? (isSelected ? "#2563eb" : "#cbd5e1");
  // The GET route serves these two inline (see [resourceId]/route.ts) — every
  // other type is served as a forced download, so previewing it here would
  // just show the browser's "can't display this" page instead of content.
  const rendersDirectly =
    mimeType === "application/pdf" || mimeType === "text/plain" || mimeType?.startsWith("image/");
  const { downloadUrl, previewUrl } = getFileUrls(boardId, block.data);
  const canPreview = Boolean(previewUrl);
  // Page jump only makes sense for a PDF-shaped preview (native or converted).
  const isPdfPreview = isPdfPreviewable(block.data);
  const activated = clicked || isPdfPreview;
  const currentPage = filePreviewPage ?? range?.page ?? 1;
  const iframeSrc = previewUrl && !isPdfPreview ? previewUrl : null;
  // Once the PDF canvas is showing, filename/download already live in
  // WorkspaceFileSelectionToolbar (the floating bar above the selection) —
  // repeating them in the block's own header just wastes space the page
  // could use, and the reference layout this is modeled on shows the page
  // edge-to-edge with no in-block chrome at all.
  const showHeader = !(isPdfPreview && activated);
  const previewUnavailableReason =
    !rendersDirectly && previewArtifact
      ? previewArtifact.status === "UNSUPPORTED"
        ? "Preview isn't supported on this server"
        : previewArtifact.status === "FAILED"
          ? "Preview couldn't be generated"
          : null
      : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: "6px",
        backgroundColor,
        border: `${isSelected ? "2px" : "1px"} solid ${borderColor}`,
        boxShadow: isSelected
          ? "0 0 0 1px #2563eb, 0 4px 6px -1px rgba(0, 0, 0, 0.1)"
          : "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
        padding: showHeader ? "8px" : 0,
        display: "flex",
        flexDirection: "column",
        gap: showHeader ? "6px" : 0,
        overflow: "hidden",
      }}
    >
      {showHeader && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, padding: "2px 4px" }}>
          <span style={{ display: "flex", flexShrink: 0 }}>{iconFor(mimeType ?? "")}</span>
          <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "#0f172a",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={filename}
            >
              {filename || "Untitled file"}
            </span>
            <span style={{ fontSize: "11px", color: "#64748b" }}>{formatBytes(sizeBytes ?? "0")}</span>
          </div>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              title="Download"
              style={{ flexShrink: 0, display: "flex", textDecoration: "none", color: "#2563eb" }}
            >
              <Download size={16} />
            </a>
          ) : null}
        </div>
      )}

      {canPreview && !activated && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setClicked(true)}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            borderRadius: "4px",
            border: "1px dashed #cbd5e1",
            backgroundColor: "#f8fafc",
            color: "#2563eb",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          <Play size={12} fill="#2563eb" /> Click to preview
        </button>
      )}

      {canPreview && activated && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: showHeader ? "4px" : 0 }}>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              borderRadius: showHeader ? "4px" : "6px",
              overflow: "hidden",
              border: showHeader ? "1px solid #f1f5f9" : "none",
              backgroundColor: "#f8fafc",
            }}
          >
            {isPdfPreview && previewUrl ? (
              // Page nav/Pin/Extract live in WorkspaceFileSelectionToolbar
              // (the floating bar above the selected block), not here.
              <FilePdfCanvasPreview
                url={previewUrl}
                page={currentPage}
                onPageCount={(count) => setFilePreviewPageCount(block.id, count)}
                onPageSize={(ratio) => {
                  if (hasAutoSizedRef.current) return;
                  hasAutoSizedRef.current = true;
                  const current = resolveTransform(block.transform, FALLBACK_TRANSFORM);
                  updateBlockTransform(block.id, { w: current.w, h: current.w * ratio }, "override");
                }}
              />
            ) : (
              // pointerEvents follows the LinkBlock convention: an unselected
              // block must stay draggable, so scroll/zoom inside the preview
              // only activates once the block is selected.
              <iframe
                src={iframeSrc ?? undefined}
                title={filename || "File preview"}
                style={{ width: "100%", height: "100%", border: "none", pointerEvents: isSelected ? "auto" : "none" }}
              />
            )}
          </div>
        </div>
      )}

      {previewUnavailableReason && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "4px",
            border: "1px dashed #e2e8f0",
            backgroundColor: "#f8fafc",
            color: "#94a3b8",
            fontSize: "11px",
            textAlign: "center",
            padding: "8px",
          }}
        >
          {previewUnavailableReason} — download to view
        </div>
      )}
    </div>
  );
};

registerBlockRenderer("file", FileBlock);
