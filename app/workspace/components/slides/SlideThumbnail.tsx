"use client";

import React, { useState } from "react";
import { EyeOff, MoreHorizontal } from "lucide-react";
import type { SlideAspectRatio, SlideMeta, SlideStatus, SlideTheme } from "../../types/slide";
import { SLIDE_STATUS_COLOR } from "../../types/slide";
import { WorkspaceSmartPopover as SmartPopover } from "../../utils/WorkspaceSmartPopover";
import { SlideSettingsMenu } from "./SlideSettingsMenu";
import { SlideMiniPreview } from "./SlideMiniPreview";

export interface SlideThumbnailProps {
  slide: SlideMeta;
  theme?: SlideTheme;
  aspectRatio?: SlideAspectRatio;
  index: number;
  vertical?: boolean;
  isActive: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetStatus: (status: SlideStatus | undefined) => void;
  onSetBackground: (color: string | undefined) => void;
  onSetNotes: (notes: string) => void;
  onSetHidden: (hidden: boolean) => void;
}

/** One filmstrip entry: a scaled-down, non-interactive preview of the slide's
 *  rich-text body (pointer-events disabled - it's a preview, not a mini
 *  editor), a status dot, native HTML5 drag-and-drop for reordering, and a
 *  self-contained settings popover (rename/status/background/notes/duplicate/delete). */
export function SlideThumbnail({
  slide, theme, aspectRatio, index, vertical = false, isActive, canDelete, onSelect, onDragStart, onDragOver, onDrop,
  onRename, onDuplicate, onDelete, onSetStatus, onSetBackground, onSetNotes, onSetHidden,
}: SlideThumbnailProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      role="button" tabIndex={0} aria-label={`Select slide ${index + 1}: ${slide.name}`} aria-current={isActive ? "true" : undefined}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(); } }}
      draggable
      onPointerDown={(e) => e.stopPropagation()}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onClick={onSelect}
      className={`group relative flex ${vertical ? "w-full" : "w-28 shrink-0"} cursor-pointer flex-col gap-1 rounded-md p-1.5 ${
        isActive ? "bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-950/40" : "hover:bg-slate-100 dark:hover:bg-slate-800"
      } ${slide.hidden ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between px-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          {slide.status && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SLIDE_STATUS_COLOR[slide.status] }} />}
          {index + 1}
          {slide.hidden && <EyeOff className="h-2.5 w-2.5" aria-label="Hidden in presentation" />}
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="rounded p-0.5 opacity-0 hover:bg-slate-200 group-hover:opacity-100 dark:hover:bg-slate-700"
          aria-label="Slide settings"
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
        {menuOpen && (
          <SmartPopover defaultH="left" className="!z-50" onClose={() => setMenuOpen(false)}>
            <SlideSettingsMenu
              slide={slide}
              canDelete={canDelete}
              onRename={onRename}
              onDuplicate={() => {
                onDuplicate();
                setMenuOpen(false);
              }}
              onDelete={() => {
                onDelete();
                setMenuOpen(false);
              }}
              onSetStatus={onSetStatus}
              onSetBackground={onSetBackground}
              onSetNotes={onSetNotes}
              onSetHidden={onSetHidden}
            />
          </SmartPopover>
        )}
      </div>
      <SlideMiniPreview html={slide.html} scene={slide.scene} backgroundColor={slide.backgroundColor} theme={theme} aspectRatio={aspectRatio} />
      <div className="truncate px-0.5 text-[10px] text-slate-500 dark:text-slate-400">{slide.name}</div>
    </div>
  );
}

export default SlideThumbnail;
