"use client";

import { useState } from "react";
import { ChevronDown, Type } from "lucide-react";
import type { WorkspaceInlineRichEditorActiveMarks, WorkspaceInlineRichEditorCommands } from "../store/useWorkspaceStore";
import { WorkspaceSmartPopover } from "../utils/WorkspaceSmartPopover";

const FONTS = [
  ["Arial", "Arial, sans-serif"], ["Georgia", "Georgia, serif"],
  ["Times New Roman", "Times New Roman, serif"], ["Verdana", "Verdana, sans-serif"],
  ["Monospace", "ui-monospace, monospace"],
];
const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map(size => [`${size}`, `${size}px`]);
const SPACING = ["1", "1.15", "1.5", "1.75", "2"].map(value => [value, value]);
const TEXT_COLORS = ["#1e293b", "#475569", "#dc2626", "#c2410c", "#15803d", "#2563eb", "#7c3aed"];
const HIGHLIGHTS = ["#fef08a", "#fed7aa", "#fecaca", "#bbf7d0", "#bfdbfe", "#ddd6fe"];
const selectClass = "w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

function FormatSelect({ label, value, options, onChange }: {
  label: string; value?: string; options: string[][]; onChange?: (value: string | null) => void;
}) {
  if (!onChange) return null;
  return <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
    {label}
    <select aria-label={label} className={selectClass} value={value || ""} onChange={event => onChange(event.target.value || null)}>
      <option value="">Default</option>
      {value && !options.some(([, option]) => option === value) && <option value={value}>{value}</option>}
      {options.map(([name, option]) => <option key={option} value={option}>{name}</option>)}
    </select>
  </label>;
}

function ColorOptions({ label, value, colors, onChange }: {
  label: string; value?: string; colors: string[]; onChange?: (value: string | null) => void;
}) {
  if (!onChange) return null;
  return <fieldset className="space-y-2">
    <legend className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</legend>
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map(color => <button key={color} type="button" aria-label={`${label} ${color}`} title={color}
        aria-pressed={value?.toLowerCase() === color} onClick={() => onChange(color)}
        className={`h-6 w-6 rounded border border-black/20 ${value?.toLowerCase() === color ? "outline outline-2 outline-offset-1 outline-blue-500" : ""}`}
        style={{ backgroundColor: color }} />)}
      <input type="color" aria-label={`Custom ${label.toLowerCase()}`} title={`Custom ${label.toLowerCase()}`}
        value={/^#[0-9a-f]{6}$/i.test(value || "") ? value : colors[0]}
        onChange={event => onChange(event.target.value)} className="h-7 w-8 cursor-pointer rounded border border-slate-300 bg-transparent" />
      <button type="button" onClick={() => onChange(null)} className="rounded px-1.5 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800">Reset</button>
    </div>
  </fieldset>;
}

export function WorkspaceDocTypographyControls({ commands, marks }: {
  commands: WorkspaceInlineRichEditorCommands; marks: WorkspaceInlineRichEditorActiveMarks;
}) {
  const [open, setOpen] = useState(false);
  if (!commands.setFontFamily && !commands.setTextColor) return null;
  return <div className="relative">
    <button type="button" aria-label="Font, spacing and colors" title="Font, spacing and colors" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(value => !value)} className="flex items-center gap-1 rounded-lg p-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
      <Type className="h-3.5 w-3.5" /><ChevronDown className="h-3 w-3" />
    </button>
    {open && <WorkspaceSmartPopover onClose={() => setOpen(false)}>
      <div role="dialog" aria-label="Font, spacing and colors" className="w-72 max-w-[calc(100vw-24px)] space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-950" onPointerDown={event => event.stopPropagation()}>
        <FormatSelect label="Font family" value={marks.fontFamily} options={FONTS} onChange={commands.setFontFamily} />
        <div className="grid grid-cols-2 gap-2">
          <FormatSelect label="Font size" value={marks.fontSize} options={SIZES} onChange={commands.setFontSize} />
          <FormatSelect label="Line spacing" value={marks.lineHeight} options={SPACING} onChange={commands.setLineHeight} />
        </div>
        <ColorOptions label="Text color" value={marks.textColor} colors={TEXT_COLORS} onChange={commands.setTextColor} />
        <ColorOptions label="Highlight" value={marks.highlightColor} colors={HIGHLIGHTS} onChange={commands.setHighlightColor} />
      </div>
    </WorkspaceSmartPopover>}
  </div>;
}
