"use client";

import React, { useState } from "react";
import { Palette, Play } from "lucide-react";
import type { SlideAspectRatio, SlideTheme } from "../../types/slide";
import { WorkspaceSmartPopover as SmartPopover } from "../../utils/WorkspaceSmartPopover";
import { SlideThemeMenu } from "./SlideThemeMenu";
import { SlideExportMenu } from "./SlideExportMenu";

export interface SlideDeckToolbarProps {
  blockId?: string;
  title?: string;
  aspectRatio: SlideAspectRatio;
  slideCount: number;
  theme?: SlideTheme;
  showSlideNumbers: boolean;
  onChangeAspectRatio: (ratio: SlideAspectRatio) => void;
  onChangeTheme: (patch: Partial<SlideTheme>) => void;
  onApplyBackgroundToAll: (color: string) => void;
  onToggleSlideNumbers: () => void;
  onPresent: () => void;
}

/** Top bar of the slide-deck block: deck title, aspect-ratio picker, theme,
 *  slide-number toggle and the Present button. */
export function SlideDeckToolbar({
  blockId, title, aspectRatio, slideCount, theme, showSlideNumbers,
  onChangeAspectRatio, onChangeTheme, onApplyBackgroundToAll, onToggleSlideNumbers, onPresent,
}: SlideDeckToolbarProps) {
  const [themeOpen, setThemeOpen] = useState(false);
  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="max-w-[10rem] truncate font-medium text-slate-700 dark:text-slate-200" title={title}>{title || "Slides"}</span>
        <span>{slideCount} slide{slideCount === 1 ? "" : "s"}</span>
        <select
          value={aspectRatio}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onChangeAspectRatio(e.target.value as SlideAspectRatio)}
          className="rounded border border-slate-200 bg-transparent px-1 py-0.5 text-xs dark:border-slate-700"
        >
          <option value="16:9">16:9</option>
          <option value="4:3">4:3</option>
        </select>
        <label className="flex cursor-pointer items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={showSlideNumbers} onChange={onToggleSlideNumbers} />
          Numbers
        </label>
        <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setThemeOpen((v) => !v)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Deck theme"
          >
            <Palette className="h-3.5 w-3.5" /> Theme
          </button>
          {themeOpen && (
            <SmartPopover defaultH="left" className="!z-50" onClose={() => setThemeOpen(false)}>
              <SlideThemeMenu theme={theme} onChange={onChangeTheme} onApplyBackgroundToAll={onApplyBackgroundToAll} />
            </SmartPopover>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
      {blockId && <SlideExportMenu blockId={blockId} />}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onPresent}
        className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
      >
        <Play className="h-3.5 w-3.5" /> Present
      </button>
      </div>
    </div>
  );
}

export default SlideDeckToolbar;
