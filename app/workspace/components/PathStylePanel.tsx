"use client";

import React from "react";
import {
  PATH_STROKE_SWATCHES,
  PATH_WIDTH_OPTIONS,
} from "../utils/freehandPresets";

export { PATH_STROKE_SWATCHES, PATH_WIDTH_OPTIONS } from "../utils/freehandPresets";

export interface PathStylePanelProps {
  currentStrokeColor: string | undefined;
  currentStrokeWidth: number;
  onUpdate: (patch: { strokeColor?: string; strokeWidth?: number }) => void;
}

/** Popover content for selecting a stroke color from presets */
export function PathColorPopoverContent({
  currentStrokeColor,
  onSelectColor,
}: {
  currentStrokeColor: string | undefined;
  onSelectColor: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
      {PATH_STROKE_SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          title={`Color ${color}`}
          aria-label={`Stroke color ${color}`}
          onClick={() => onSelectColor(color)}
          className={`h-5 w-5 rounded-full transition-transform hover:scale-110 cursor-pointer ${
            currentStrokeColor === color
              ? "scale-110 ring-2 ring-orange-500 ring-offset-1 dark:ring-offset-slate-900"
              : ""
          }`}
          style={{
            backgroundColor: color,
            border: color === "#ffffff" ? "1px solid #cbd5e1" : "1px solid rgba(0,0,0,0.1)",
          }}
        />
      ))}
    </div>
  );
}

/** Popover content for selecting a stroke width from presets */
export function PathWidthPopoverContent({
  currentStrokeWidth,
  onSelectWidth,
}: {
  currentStrokeWidth: number;
  onSelectWidth: (width: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
      {PATH_WIDTH_OPTIONS.map((opt) => (
        <button
          key={opt.label}
          type="button"
          title={`${opt.label} (${opt.value}px)`}
          aria-label={`${opt.label} stroke width`}
          onClick={() => onSelectWidth(opt.value)}
          className={`flex h-6 w-6 items-center justify-center rounded-full transition-transform hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${
            currentStrokeWidth === opt.value
              ? "scale-105 ring-2 ring-orange-500 ring-offset-1 dark:ring-offset-slate-900"
              : ""
          }`}
        >
          <span
            className="rounded-full bg-slate-700 dark:bg-slate-200"
            style={{
              width: Math.max(3, Math.min(12, opt.value)),
              height: Math.max(3, Math.min(12, opt.value)),
            }}
          />
        </button>
      ))}
    </div>
  );
}

/** Stroke color/width controls for a selected "path" (freehand) block */
export function PathStylePanel({
  currentStrokeColor,
  currentStrokeWidth,
  onUpdate,
}: PathStylePanelProps) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 select-none">
          Stroke Color
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PATH_STROKE_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              aria-label={`Stroke color ${color}`}
              onClick={() => onUpdate({ strokeColor: color })}
              style={{
                backgroundColor: color,
                border: color === "#ffffff" ? "1px solid #cbd5e1" : "1px solid rgba(0,0,0,0.1)",
              }}
              className={`h-[18px] w-[18px] rounded-full transition hover:scale-110 ${
                currentStrokeColor === color
                  ? "ring-2 ring-orange-500 ring-offset-1 dark:ring-offset-slate-900"
                  : ""
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 select-none">
          Stroke Width
        </span>
        <div className="flex items-center gap-1 rounded bg-slate-100 p-0.5 dark:bg-slate-800">
          {PATH_WIDTH_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => onUpdate({ strokeWidth: opt.value })}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
                currentStrokeWidth === opt.value
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export default PathStylePanel;
