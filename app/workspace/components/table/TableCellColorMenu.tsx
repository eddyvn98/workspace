"use client";

import React from "react";

export interface TableCellColorMenuProps {
  bgColor?: string;
  textColor?: string;
  onSetBgColor: (color: string | undefined) => void;
  onSetTextColor: (color: string | undefined) => void;
}

const SWATCHES = ["#f8fafc", "#fee2e2", "#ffedd5", "#fef9c3", "#dcfce7", "#dbeafe", "#ede9fe", "#fce7f3"];

function SwatchRow({ value, onPick, onClear }: { value?: string; onPick: (color: string) => void; onClear: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title="No color"
        aria-label="No color"
        className={`h-5 w-5 rounded border border-slate-300 bg-white text-[10px] text-slate-400 dark:border-slate-600 ${!value ? "ring-2 ring-blue-500" : ""}`}
        onClick={onClear}
      >
        ×
      </button>
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          aria-label={color}
          className={`h-5 w-5 rounded border border-slate-300 dark:border-slate-600 ${value === color ? "ring-2 ring-blue-500" : ""}`}
          style={{ backgroundColor: color }}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  );
}

/** Whole-cell background/text color picker, embedded in the table cell
 *  context menu - consistent with cellFontSizes/cellAlign's whole-cell (not
 *  per-run) granularity, see BlockDataMap["table"] in types/block.ts. */
export function TableCellColorMenu({ bgColor, textColor, onSetBgColor, onSetTextColor }: TableCellColorMenuProps) {
  return (
    <div className="flex flex-col gap-1.5 px-2.5 py-1.5">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cell color</div>
        <SwatchRow value={bgColor} onPick={onSetBgColor} onClear={() => onSetBgColor(undefined)} />
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Text color</div>
        <SwatchRow value={textColor} onPick={onSetTextColor} onClear={() => onSetTextColor(undefined)} />
      </div>
    </div>
  );
}

export default TableCellColorMenu;
