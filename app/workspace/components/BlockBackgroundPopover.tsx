"use client";

import React from "react";
import { Palette } from "lucide-react";
import { BG_SWATCHES, SwatchPopover, SwatchRow } from "./BlockStylePanelSwatchPopover";

interface BlockBackgroundPopoverProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  placeBelow: boolean;
  backgroundColor: string | undefined;
  backgroundOpacity: number | undefined;
  onPickColor: (color: string | undefined) => void;
  onOpacityChange: (opacity: number) => void;
  btnActive: string;
  btnInactive: string;
}

/** Background-color icon button + popover (swatches + opacity slider) —
 *  split out of BlockStylePanel.tsx to keep that file under the 300-line
 *  cap once the opacity slider (Tier 1 audit §1 "no opacity slider
 *  anywhere") landed. */
export function BlockBackgroundPopover({
  isOpen,
  onToggle,
  onClose,
  placeBelow,
  backgroundColor,
  backgroundOpacity,
  onPickColor,
  onOpacityChange,
  btnActive,
  btnInactive,
}: BlockBackgroundPopoverProps) {
  const opacityPercent = Math.round((backgroundOpacity ?? 1) * 100);

  return (
    <div className="relative">
      <button
        type="button"
        title="Background Color"
        aria-label="Background Color"
        onClick={onToggle}
        className={`flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs font-medium transition cursor-pointer ${
          isOpen ? btnActive : btnInactive
        }`}
      >
        <Palette className="h-3.5 w-3.5" />
        <span
          className="h-2.5 w-2.5 rounded-full border border-black/15 dark:border-white/20 shrink-0"
          style={{ backgroundColor: backgroundColor ?? "#ffffff" }}
        />
      </button>
      <SwatchPopover isOpen={isOpen} onClose={onClose} title="Background Color" placeBelow={placeBelow}>
        <SwatchRow
          options={BG_SWATCHES}
          current={backgroundColor}
          onPick={onPickColor}
          ariaPrefix="Background"
        />
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 select-none">Opacity</span>
          <input
            type="range"
            min={10}
            max={100}
            value={opacityPercent}
            onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
            className="h-1.5 flex-1 accent-blue-600"
          />
          <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
            {opacityPercent}%
          </span>
        </div>
      </SwatchPopover>
    </div>
  );
}

export default BlockBackgroundPopover;
