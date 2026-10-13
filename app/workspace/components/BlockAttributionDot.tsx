"use client";

import React, { useState } from "react";
import { colorForEmail, initialsForEmail } from "../utils/presenceColor";
import { WorkspaceBlockHistoryPopover } from "./WorkspaceBlockHistoryPopover";
import type { CanvasBlock } from "../types/block";

/** Small "last edited by" dot with the node history popover anchored to it. */
export function BlockAttributionDot({
  email,
  updatedAt,
  boardId,
  blockId,
  onPreviewVersion,
  isHistoryOpen: controlledHistoryOpen,
  onHistoryOpenChange,
}: {
  email: string;
  updatedAt: number;
  boardId?: string | null;
  blockId?: string;
  onPreviewVersion?: (version: CanvasBlock) => void;
  isHistoryOpen?: boolean;
  onHistoryOpenChange?: (open: boolean) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [localHistoryOpen, setLocalHistoryOpen] = useState(false);
  const isHistoryOpen = controlledHistoryOpen ?? localHistoryOpen;
  const color = colorForEmail(email);
  const canOpenHistory = Boolean(boardId && blockId);
  const toggleHistory = () => {
    if (!canOpenHistory) return;
    const next = !isHistoryOpen;
    setLocalHistoryOpen(next);
    onHistoryOpenChange?.(next);
  };
  const closeHistory = () => {
    setLocalHistoryOpen(false);
    onHistoryOpenChange?.(false);
  };

  return (
    <div
      // Pushed left of the sw resize handle's hit box (-14px to 14px) and
      // clear of the rotate handle (bottom:-26/left:-26, 18px) that shares
      // this corner when the block is selected — -8/-8 used to sit right on
      // top of the resize point itself.
      className="absolute -bottom-2 left-[-34px] z-[15]"
      data-workspace-attribution-dot="true"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold text-white shadow ring-1 ring-white dark:ring-slate-900"
        style={{ backgroundColor: color }}
        role={canOpenHistory ? "button" : undefined}
        tabIndex={canOpenHistory ? 0 : -1}
        aria-label={canOpenHistory ? `Last edited by ${email} — click for full history` : undefined}
        title={canOpenHistory ? "Click to see this node's edit history" : `Edited by ${email}`}
        onClick={toggleHistory}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleHistory();
          }
        }}
      >
        {initialsForEmail(email)}
      </div>
      {isHovered && (
        <div className="absolute bottom-full left-0 mb-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-[10px] text-slate-600 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-300">
          Edited by {email}
          <br />
          {new Date(updatedAt).toLocaleString()}
        </div>
      )}
      {isHistoryOpen && boardId && blockId && <WorkspaceBlockHistoryPopover boardId={boardId} blockId={blockId} onClose={closeHistory} onPreviewVersion={onPreviewVersion} />}
    </div>
  );
}

export default BlockAttributionDot;
