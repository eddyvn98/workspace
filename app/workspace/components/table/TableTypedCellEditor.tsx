"use client";

import React, { useEffect, useRef, useState } from "react";
import type { TableColumnOption, TableColumnType } from "../../types/table";
import type { TableNavigationDirection } from "../../utils/tableKeyboard";

export interface TableTypedCellEditorProps {
  columnType: Exclude<TableColumnType, "text" | "person">;
  rawValue: string;
  options: TableColumnOption[];
  onChange: (rawValue: string) => void;
  onBlur: () => void;
  onNavigate?: (direction: TableNavigationDirection, rawValue: string) => void;
  onCancel?: () => void;
}

/** Edit-mode for "select"/"date"/"number" columns - deliberately NOT rich
 *  text (TableCellEditor): a spreadsheet-typed column holds one plain value,
 *  same as a real database's typed field. "text"/"person" columns keep
 *  using TableCellEditor instead (see TableCell.tsx). */
export function TableTypedCellEditor({ columnType, rawValue, options, onChange, onBlur, onNavigate, onCancel }: TableTypedCellEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(rawValue);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (columnType === "select") {
    return (
      <div className="flex h-full w-full flex-col gap-0.5 overflow-y-auto p-1" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onCancel?.(); }}>
        <button type="button" className="rounded px-1.5 py-1 text-left text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => { onChange(""); onBlur(); }}>
          None
        </button>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => { onChange(opt.id); onBlur(); }}
          >
            <span className="inline-flex items-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: opt.color }}>
              {opt.label}
            </span>
          </button>
        ))}
        {options.length === 0 && <div className="px-1.5 py-1 text-[11px] text-slate-400">No options yet - add some via the column&apos;s settings.</div>}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type={columnType === "date" ? "date" : "number"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { onChange(draft); onBlur(); }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const direction = e.key === "Tab" ? (e.shiftKey ? "previous" : "next") : (e.shiftKey ? "up" : "down");
          if (onNavigate) onNavigate(direction, draft);
          else { onChange(draft); onBlur(); }
        } else if (e.key === "Escape") {
          if (onCancel) onCancel();
          else { onChange(rawValue); onBlur(); }
        }
      }}
      className="h-full w-full border-none bg-transparent px-2 py-1.5 outline-none"
      style={{ textAlign: columnType === "number" ? "right" : "left" }}
    />
  );
}

export default TableTypedCellEditor;
