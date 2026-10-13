"use client";

import React from "react";
import {
  useCanvasBackground,
  setCanvasBackgroundColor,
} from "../hooks/useCanvasBackground";

const CANVAS_SWATCHES = [
  "#f8fafc",
  "#fef9e7",
  "#f0fdf4",
  "#eff6ff",
  "#fdf4ff",
  "#fff1f2",
  "#1e293b",
];

export function CanvasBackgroundPicker() {
  const currentBg = useCanvasBackground();

  return (
    <div
      className="fixed bottom-20 left-52 z-40 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur max-sm:bottom-40 max-sm:left-2 dark:border-slate-800 dark:bg-slate-900/95"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 select-none">
        Canvas
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title="Default"
          aria-label="Default canvas background"
          onClick={() => setCanvasBackgroundColor(null)}
          className={`relative flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-full border border-slate-300 transition hover:scale-110 dark:border-slate-600 ${
            currentBg === null
              ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900"
              : ""
          }`}
        >
          <div className="h-full w-0.5 rotate-45 bg-red-400" />
        </button>
        {CANVAS_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            aria-label={`Canvas background ${color}`}
            onClick={() => setCanvasBackgroundColor(color)}
            style={{ backgroundColor: color }}
            className={`h-[18px] w-[18px] rounded-full border border-black/10 transition hover:scale-110 dark:border-white/20 ${
              currentBg === color
                ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900"
                : ""
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default CanvasBackgroundPicker;
