"use client";

import React, { useRef } from "react";
import { Download, MessageSquare, RefreshCw, Trash2 } from "lucide-react";
import type { BlockId, CanvasBlock } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { uploadWorkspaceImageWithOriginal } from "../utils/imageUpload";
import { getImageFlowAssetLabel } from "../utils/imageFlowLabels";

const buttonClass = "flex items-center gap-1 rounded-lg p-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";
const activeButtonClass = `${buttonClass} bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400`;

export interface WorkspaceImageSelectionToolbarProps {
  block: CanvasBlock<"image">;
  id: BlockId;
  toolbarRef: React.RefObject<HTMLDivElement>;
  style: { left: number; top: number } | null;
}

/** Floating bar shown above a selected `image` block — filename, Replace,
 *  Comment and Download, matching the reference widget's toolbar. Same
 *  early-return delegation and floating-pill visuals as
 *  WorkspaceFileSelectionToolbar. Swapping the image itself (URL/alt/fit
 *  editing) used to be a panel that stayed open inside the block; that's
 *  gone now — Replace uploads a new file and overwrites `data.url` in
 *  place, and dropping a file from the OS onto an existing image block
 *  (see useImageDropFromOS.ts) does the same thing without touching this
 *  toolbar at all. */
export function WorkspaceImageSelectionToolbar({ block, id, toolbarRef, style }: WorkspaceImageSelectionToolbarProps) {
  const activeCommentBlockId = useWorkspaceStore((s) => s.activeCommentBlockId);
  const setActiveCommentBlockId = useWorkspaceStore((s) => s.setActiveCommentBlockId);
  const updateBlock = useWorkspaceStore((s) => s.updateBlock);
  const removeBlock = useWorkspaceStore((s) => s.removeBlock);
  const blocks = useWorkspaceStore((s) => s.blocks);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCommenting = activeCommentBlockId === id;
  const { url, alt, downloadUrl } = block.data;
  const origin = block.data.imageFlowOrigin;
  // Dropped-from-OS images stash the original filename in `alt` (see
  // useImageDropFromOS.ts); an image added by URL has no such name.
  const label = getImageFlowAssetLabel(blocks, block);

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;

    const uploaded = await uploadWorkspaceImageWithOriginal(file);
    if (!uploaded) {
      console.error("Workspace image replace failed");
      return;
    }
    updateBlock(id, {
      data: { ...block.data, url: uploaded.url, downloadUrl: uploaded.downloadUrl, alt: file.name, extraUrls: undefined, activeIndex: 0, imageFlowOrigin: undefined, resourceId: undefined },
    });
  };

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Image selection toolbar"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.preventDefault()}
      style={style ?? { top: 80, left: 16 }}
      className="fixed z-50 flex w-max max-w-[calc(100vw-16px)] items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 select-none"
    >
      <span className="max-w-[160px] truncate px-1.5 text-xs font-medium text-slate-700 dark:text-slate-200" title={label}>
        {label}
      </span>
      {origin && <span className="max-w-[140px] truncate rounded-md bg-violet-50 px-1.5 py-1 text-[10px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300" title={`Created by flow ${origin.flowId}; run ${origin.runId}; image ${origin.outputIndex}`}>
		{label}
      </span>}
      <div className="flex items-center gap-0.5 border-l border-slate-200 pl-1 dark:border-slate-800">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleReplaceFile}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className={buttonClass}
          title="Replace image"
          onClick={() => fileInputRef.current?.click()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={isCommenting ? activeButtonClass : buttonClass}
          title="Comment"
          aria-pressed={isCommenting}
          onClick={() => setActiveCommentBlockId(isCommenting ? null : id)}
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={buttonClass} title="Delete image from canvas" onClick={() => removeBlock(id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {url && (
          <a href={downloadUrl ?? url} target="_blank" rel="noopener noreferrer" download={alt || undefined} title="Download original" className={buttonClass}>
            <Download className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export default WorkspaceImageSelectionToolbar;
