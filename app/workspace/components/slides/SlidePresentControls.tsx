"use client";

import React from "react";
import { ChevronLeft, ChevronRight, Grid3x3, NotebookText, X } from "lucide-react";

export interface SlidePresentControlsProps {
  index: number;
  total: number;
  showGrid: boolean;
  showNotes: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleGrid: () => void;
  onToggleNotes: () => void;
  onExit: () => void;
}

/** Present mode's bottom control bar - navigation, slide counter, grid
 *  overview toggle, presenter-notes panel toggle, and exit. */
export function SlidePresentControls({ index, total, showGrid, showNotes, onPrev, onNext, onToggleGrid, onToggleNotes, onExit }: SlidePresentControlsProps) {
  const iconBtn = "flex h-8 w-8 items-center justify-center rounded text-slate-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30";
  return (
    <div className="flex items-center justify-between bg-black/90 px-4 py-2 text-white">
      <div className="flex items-center gap-1">
        <button type="button" className={iconBtn} onClick={onPrev} disabled={index <= 0} aria-label="Previous slide">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-12 text-center text-xs text-slate-300">{index + 1} / {total}</span>
        <button type="button" className={iconBtn} onClick={onNext} disabled={index >= total - 1} aria-label="Next slide">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" className={`${iconBtn} ${showGrid ? "bg-white/10 text-white" : ""}`} onClick={onToggleGrid} aria-label="Slide overview">
          <Grid3x3 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className={`${iconBtn} ${showNotes ? "bg-white/10 text-white" : ""}`} onClick={onToggleNotes} aria-label="Presenter notes">
          <NotebookText className="h-4 w-4" />
        </button>
        <button type="button" className={iconBtn} onClick={onExit} aria-label="Exit presentation">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default SlidePresentControls;
