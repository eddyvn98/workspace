"use client";

import React from "react";
import { Check } from "lucide-react";
import { ARRANGE_COLOR_PRESETS, type ArrangeColorPreset } from "../layout/arrangeColorPresets";

interface ArrangeColorPresetRowProps {
  selectedPresetId: string | null;
  onSelect: (preset: ArrangeColorPreset | null) => void;
}

/** Preset swatch row at the bottom of WorkspaceArrangeMenu.tsx — split into
 *  its own file since that menu was already near the 300-line cap. */
export function ArrangeColorPresetRow({ selectedPresetId, onSelect }: ArrangeColorPresetRowProps) {
  return (
    <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Color Preset
      </div>
      <div className="flex items-center gap-1.5 px-2.5 pb-1">
        <button
          type="button"
          title="None"
          aria-label="No color preset"
          onClick={() => onSelect(null)}
          className={`relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-300 transition hover:scale-110 dark:border-slate-600 ${
            selectedPresetId === null ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900" : ""
          }`}
        >
          <div className="h-full w-0.5 rotate-45 bg-red-400" />
        </button>
        {ARRANGE_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.name}
            aria-label={preset.name}
            onClick={() => onSelect(preset)}
            className={`relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/10 transition hover:scale-110 dark:border-white/20 ${
              selectedPresetId === preset.id ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900" : ""
            }`}
            style={{
              background: `conic-gradient(${preset.colors.join(", ")})`,
            }}
          >
            {selectedPresetId === preset.id && <Check className="h-3 w-3 text-white drop-shadow" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ArrangeColorPresetRow;
