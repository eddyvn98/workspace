"use client";

import React from "react";
import type { SlideDeckPayload } from "../../types/slide";
import { SlideMiniPreview } from "./SlideMiniPreview";

export interface SlidePresentGridProps {
  data: SlideDeckPayload;
  currentIndex: number;
  onJump: (index: number) => void;
}

/** Present mode's slide-overview grid, toggled by the grid button in
 *  SlidePresentOverlay's controls - lets the presenter jump straight to any
 *  slide instead of stepping through next/prev one at a time. */
export function SlidePresentGrid({ data, currentIndex, onJump }: SlidePresentGridProps) {
  return (
    <div className="grid grid-cols-4 gap-4 overflow-y-auto p-6 sm:grid-cols-5 md:grid-cols-6">
      {data.slideOrder.map((id, index) => {
        const slide = data.slides[id];
        if (!slide) return null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onJump(index)}
            className={`flex flex-col gap-1 rounded-md p-1 text-left ${index === currentIndex ? "ring-2 ring-blue-500" : "hover:bg-white/10"}`}
          >
            <SlideMiniPreview html={slide.html} backgroundColor={slide.backgroundColor} theme={data.theme} aspectRatio={data.aspectRatio} />
            <span className="truncate text-xs text-slate-200">{index + 1}. {slide.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export default SlidePresentGrid;
