"use client";

import React from "react";
import type { SlideTheme } from "../../types/slide";
import { SLIDE_THEME_PRESET_IDS, SLIDE_THEME_PRESETS, themeFromPreset } from "../../utils/slideThemePresets";

const BG_SWATCHES = ["#ffffff", "#f1f5f9", "#fef3c7", "#dcfce7", "#dbeafe", "#fce7f3", "#1e293b"];
const TEXT_SWATCHES = ["#1e293b", "#0f172a", "#475569", "#ffffff", "#1d4ed8", "#b91c1c"];
const ACCENT_SWATCHES = ["#2563eb", "#38bdf8", "#16a34a", "#ea580c", "#dc2626", "#7c3aed", "#52525b"];
const FONTS: Array<{ label: string; value: string }> = [
  { label: "Default", value: "" },
  { label: "Sans-serif", value: "Arial, Helvetica, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", value: "'Courier New', monospace" },
];

export interface SlideThemeMenuProps {
  theme: SlideTheme | undefined;
  onChange: (patch: Partial<SlideTheme>) => void;
  onApplyBackgroundToAll: (color: string) => void;
}

function Swatches({ colors, active, onPick, label }: { colors: string[]; active: string | undefined; onPick: (color: string | undefined) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onPick(active === color ? undefined : color)}
          className={`h-5 w-5 rounded-full border ${active === color ? "ring-2 ring-blue-500" : "border-slate-300 dark:border-slate-600"}`}
          style={{ backgroundColor: color }}
          aria-label={`${label} ${color}`}
        />
      ))}
    </div>
  );
}

/** Popover content for the deck-wide theme: default slide background, text
 *  colour and font. A slide's own background still overrides the theme. */
export function SlideThemeMenu({ theme, onChange, onApplyBackgroundToAll }: SlideThemeMenuProps) {
  const label = "mb-1 block font-medium text-slate-500 dark:text-slate-400";
  return (
    <div className="w-60 space-y-3 p-3 text-xs">
      <div>
        <span className={label}>Preset</span>
        <div className="grid grid-cols-2 gap-1.5">
          {SLIDE_THEME_PRESET_IDS.map((id) => {
            const preset = SLIDE_THEME_PRESETS[id].theme;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(themeFromPreset(id))}
                aria-pressed={theme?.preset === id}
                className={`flex items-center gap-1.5 rounded border px-1.5 py-1 text-left ${theme?.preset === id ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200 dark:border-slate-700"}`}
              >
                <span className="flex h-4 w-6 shrink-0 items-center justify-center rounded-sm border border-slate-300 text-[9px] font-bold" style={{ backgroundColor: preset.backgroundColor, color: preset.accentColor }}>Aa</span>
                <span className="truncate">{SLIDE_THEME_PRESETS[id].label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <span className={label}>Background</span>
        <Swatches colors={BG_SWATCHES} active={theme?.backgroundColor} onPick={(color) => onChange({ backgroundColor: color })} label="Theme background" />
        {theme?.backgroundColor && (
          <button type="button" onClick={() => onApplyBackgroundToAll(theme.backgroundColor!)} className="mt-2 rounded px-2 py-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-slate-800">
            Apply to all slides
          </button>
        )}
      </div>
      <div>
        <span className={label}>Text colour</span>
        <Swatches colors={TEXT_SWATCHES} active={theme?.textColor} onPick={(color) => onChange({ textColor: color })} label="Theme text colour" />
      </div>
      <div>
        <span className={label}>Accent colour</span>
        <Swatches colors={ACCENT_SWATCHES} active={theme?.accentColor} onPick={(color) => onChange({ accentColor: color })} label="Theme accent colour" />
      </div>
      <div>
        <label className={label} htmlFor="slide-theme-font">Font</label>
        <select
          id="slide-theme-font"
          value={theme?.fontFamily ?? ""}
          onChange={(e) => onChange({ fontFamily: e.target.value || undefined })}
          className="w-full rounded border border-slate-200 bg-transparent px-1 py-1 dark:border-slate-700"
        >
          {FONTS.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
          {theme?.fontFamily && !FONTS.some((font) => font.value === theme.fontFamily) && <option value={theme.fontFamily}>{theme.fontFamily}</option>}
        </select>
      </div>
    </div>
  );
}

export default SlideThemeMenu;
