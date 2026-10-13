"use client";

import React from "react";
import { Check } from "lucide-react";
import type { BlockStyle } from "../types/block";
import { WorkspaceSmartPopover as SmartPopover } from "../utils/WorkspaceSmartPopover";

const TEXT_COLORS = [
  { name: "Default", value: "" },
  { name: "Slate", value: "#475569" },
  { name: "Purple", value: "#7c3aed" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Yellow", value: "#a16207" },
  { name: "Orange", value: "#ea580c" },
  { name: "Red", value: "#dc2626" },
];
const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24];

export function WorkspaceTextColorPopover({
  textColor,
  onPick,
  onClose,
}: {
  textColor?: string;
  onPick: (patch: Partial<BlockStyle>) => void;
  onClose: () => void;
}) {
  const current = textColor?.trim().toLowerCase() ?? "";
  const options = textColor && !TEXT_COLORS.some((color) => color.value && color.value.toLowerCase() === current)
    ? [{ name: "Current", value: textColor }, ...TEXT_COLORS]
    : TEXT_COLORS;

  return (
    <SmartPopover defaultH="left" onClose={onClose}>
      <div className="flex min-w-[160px] flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-950">
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Text color</span>
        <div className="grid grid-cols-4 gap-1.5">
          {options.map((color) => {
            const selected = current === color.value.toLowerCase();
            return (
              <button key={`${color.name}-${color.value}`} type="button" title={color.name} aria-pressed={selected} onClick={() => { onPick({ textColor: color.value || undefined }); onClose(); }} className={`relative flex h-6 w-6 items-center justify-center rounded border transition-transform hover:scale-110 ${selected ? "border-orange-500 ring-2 ring-orange-500/20" : "border-slate-200 dark:border-slate-800"}`} style={{ color: color.value || "#64748b", backgroundColor: "#f8fafc" }}>
                <span className="text-xs font-bold">A</span>
                {selected && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white bg-orange-500" />}
              </button>
            );
          })}
        </div>
      </div>
    </SmartPopover>
  );
}

export function WorkspaceFontSizePopover({
  currentSize,
  onPick,
  onClose,
}: {
  currentSize: number;
  onPick: (size: number) => void;
  onClose: () => void;
}) {
  return (
    <SmartPopover defaultH="left" onClose={onClose}>
      <div className="flex max-h-[160px] min-w-[70px] flex-col gap-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-950">
        {FONT_SIZES.map((size) => (
          <button key={size} type="button" onClick={() => { onPick(size); onClose(); }} className="flex items-center justify-between rounded px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50">
            <span>{size}</span>
            {currentSize === size && <Check className="h-3 w-3 text-orange-500" />}
          </button>
        ))}
      </div>
    </SmartPopover>
  );
}
