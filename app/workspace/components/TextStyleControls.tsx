"use client";

import React from "react";
import { AlignCenter, AlignLeft, AlignRight, CaseSensitive } from "lucide-react";
import { SwatchPopover } from "./BlockStylePanelSwatchPopover";

const FONT_SIZE_OPTIONS = [
  { label: "S", value: 12 },
  { label: "M", value: 14 },
  { label: "L", value: 18 },
  { label: "XL", value: 24 },
] as const;

const ALIGN_OPTIONS = [
  { value: "left" as const, Icon: AlignLeft, label: "Align Left" },
  { value: "center" as const, Icon: AlignCenter, label: "Align Center" },
  { value: "right" as const, Icon: AlignRight, label: "Align Right" },
];

interface TextStyleControlsProps {
  activePopover: "fontSize" | "align" | null;
  onTogglePopover: (key: "fontSize" | "align") => void;
  onClose: () => void;
  placeBelow: boolean;
  fontSize: number;
  align: "left" | "center" | "right";
  onFontSizeChange: (size: number) => void;
  onAlignChange: (align: "left" | "center" | "right") => void;
  btnActive: string;
  btnInactive: string;
}

/** Block-level font-size + alignment controls, always available on the
 *  style panel for text blocks — not just while text is selected (that's
 *  TextFormatToolbar.tsx's job). Mirrors the old app's persistent
 *  "11px"/"Aa" toolbar controls, split into their own file to keep
 *  BlockStylePanel.tsx under the 300-line cap. */
export function TextStyleControls({
  activePopover,
  onTogglePopover,
  onClose,
  placeBelow,
  fontSize,
  align,
  onFontSizeChange,
  onAlignChange,
  btnActive,
  btnInactive,
}: TextStyleControlsProps) {
  return (
    <>
      <div className="relative">
        <button
          type="button"
          title="Font Size"
          aria-label="Font Size"
          onClick={() => onTogglePopover("fontSize")}
          className={`flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs font-medium transition cursor-pointer ${
            activePopover === "fontSize" ? btnActive : btnInactive
          }`}
        >
          <CaseSensitive className="h-3.5 w-3.5" />
          <span className="text-[10px] tabular-nums">{fontSize}</span>
        </button>
        <SwatchPopover isOpen={activePopover === "fontSize"} onClose={onClose} title="Font Size" placeBelow={placeBelow}>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {FONT_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={`${opt.value}px`}
                onClick={() => {
                  onFontSizeChange(opt.value);
                  onClose();
                }}
                className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition cursor-pointer ${
                  fontSize === opt.value
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </SwatchPopover>
      </div>

      <div className="flex items-center gap-0.5">
        {ALIGN_OPTIONS.map(({ value, Icon, label }) => (
          <button
            key={value}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={align === value}
            onClick={() => onAlignChange(value)}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition cursor-pointer ${
              align === value ? btnActive : btnInactive
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </>
  );
}

export default TextStyleControls;
