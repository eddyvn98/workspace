"use client";

import React from "react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import type { TableCellAlignment } from "../../types/table";

export type TableCellEditorCommand =
  | { type: "toggle-mark"; mark: "bold" | "italic" | "underline" }
  | { type: "font-size"; value: number }
  | { type: "align"; value: TableCellAlignment };

interface TableCellEditorToolbarProps {
  onCommand: (command: TableCellEditorCommand) => void;
  embedded?: boolean;
}

const buttonClass = "rounded px-1.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700";
export const WORKSPACE_TABLE_CELL_EDITOR_COMMAND_EVENT = "workspace-table-cell-command";

export function TableCellEditorToolbar({ onCommand, embedded = false }: TableCellEditorToolbarProps) {
  const keepSelection = (event: React.MouseEvent) => event.preventDefault();
  return (
    <div
      role="toolbar"
      aria-label="Table cell formatting"
      data-table-editor-toolbar={embedded ? undefined : "true"}
      className={embedded
        ? "flex items-center gap-0.5"
        : "absolute bottom-full left-0 z-20 mb-1 flex items-center gap-0.5 rounded border border-slate-200 bg-white/95 px-1.5 py-0.5 shadow-md backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" className={`${buttonClass} font-bold`} aria-label="Bold" onMouseDown={keepSelection} onClick={() => onCommand({ type: "toggle-mark", mark: "bold" })}>B</button>
      <button type="button" className={`${buttonClass} italic`} aria-label="Italic" onMouseDown={keepSelection} onClick={() => onCommand({ type: "toggle-mark", mark: "italic" })}>I</button>
      <button type="button" className={`${buttonClass} underline`} aria-label="Underline" onMouseDown={keepSelection} onClick={() => onCommand({ type: "toggle-mark", mark: "underline" })}>U</button>
      <select aria-label="Font size" defaultValue="14" className="ml-1 h-7 rounded border border-slate-200 bg-transparent px-1 text-xs dark:border-slate-700" onMouseDown={keepSelection} onChange={(event) => onCommand({ type: "font-size", value: Number(event.target.value) })}>
        {[10, 12, 14, 16, 18, 24, 32].map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
      <div className="ml-1 flex items-center gap-0.5 border-l border-slate-200 pl-1 dark:border-slate-700">
        {(["left", "center", "right"] as const).map((align) => {
          const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
          return <button key={align} type="button" className={`${buttonClass} w-5`} aria-label={`Align ${align}`} title={`Align ${align}`} onMouseDown={keepSelection} onClick={() => onCommand({ type: "align", value: align })}><Icon aria-hidden className="h-3.5 w-3.5" /></button>;
        })}
      </div>
    </div>
  );
}
