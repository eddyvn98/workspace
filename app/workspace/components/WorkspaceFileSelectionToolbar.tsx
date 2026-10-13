"use client";

import React from "react";
import { Bookmark, ChevronLeft, ChevronRight, Download, LayoutGrid, Loader2 } from "lucide-react";
import type { BlockId, CanvasBlock } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { getFileUrls } from "../utils/fileBlockPreview";
import { useExtractPdfPages } from "../hooks/useExtractPdfPages";

const buttonClass = "flex items-center gap-1 rounded-lg p-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800";
const activeButtonClass = `${buttonClass} bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400`;

export interface WorkspaceFileSelectionToolbarProps {
  block: CanvasBlock<"file">;
  id: BlockId;
  toolbarRef: React.RefObject<HTMLDivElement>;
  style: { left: number; top: number } | null;
}

/** Floating bar shown above a selected PDF-shaped `file` block — filename,
 *  page nav, Pin (persist the browsed page), Extract (spread every page onto
 *  the canvas as its own block, see useExtractPdfPages.ts) and Download.
 *  Same early-return delegation as WorkspacePathSelectionToolbar/
 *  WorkspaceTableSelectionToolbar in WorkspaceSelectionToolbar.tsx, and the
 *  same floating-pill visuals (position comes from that shared
 *  useFloatingToolbarPosition call, passed down as `style`/`toolbarRef`). */
export function WorkspaceFileSelectionToolbar({ block, id, toolbarRef, style }: WorkspaceFileSelectionToolbarProps) {
  const boardId = useWorkspaceStore((s) => s.boardId);
  const updateBlock = useWorkspaceStore((s) => s.updateBlock);
  const browsedPage = useWorkspaceStore((s) => s.filePreviewPage[id]);
  const setFilePreviewPage = useWorkspaceStore((s) => s.setFilePreviewPage);
  const pageCount = useWorkspaceStore((s) => s.filePreviewPageCount[id]);
  const { extract, isExtracting } = useExtractPdfPages();

  const pinnedPage = block.data.range?.page ?? 1;
  const currentPage = browsedPage ?? pinnedPage;
  const isPinned = currentPage === pinnedPage;
  const { previewUrl, downloadUrl } = getFileUrls(boardId, block.data);

  const goToPage = (page: number) => {
    const clamped = Math.min(Math.max(page, 1), pageCount ?? page);
    setFilePreviewPage(id, clamped);
  };
  const handlePin = () => updateBlock(id, { data: { ...block.data, range: { page: currentPage } } });
  const handleExtract = () => {
    if (!previewUrl || isExtracting) return;
    void extract(id, previewUrl);
  };

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="File selection toolbar"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.preventDefault()}
      style={style ?? { top: 80, left: 16 }}
      className="fixed z-50 flex w-max max-w-[calc(100vw-16px)] items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 select-none"
    >
      <span className="max-w-[160px] truncate px-1.5 text-xs font-medium text-slate-700 dark:text-slate-200" title={block.data.filename}>
        {block.data.filename || "Untitled file"}
      </span>
      <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <button type="button" className={buttonClass} title="Previous page" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="tabular-nums">{currentPage} of {pageCount ?? "…"}</span>
        <button type="button" className={buttonClass} title="Next page" onClick={() => goToPage(currentPage + 1)} disabled={!pageCount || currentPage >= pageCount}>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1 dark:border-slate-800">
        <button type="button" className={isPinned ? activeButtonClass : buttonClass} title="Pin this page as the default view" aria-pressed={isPinned} onClick={handlePin}>
          <Bookmark className="h-3.5 w-3.5" fill={isPinned ? "currentColor" : "none"} />
        </button>
        <button type="button" className={buttonClass} title="Extract every page onto the canvas" onClick={handleExtract} disabled={!pageCount || isExtracting}>
          {isExtracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LayoutGrid className="h-3.5 w-3.5" />}
        </button>
        {downloadUrl && (
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer" title="Download" className={buttonClass}>
            <Download className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export default WorkspaceFileSelectionToolbar;
