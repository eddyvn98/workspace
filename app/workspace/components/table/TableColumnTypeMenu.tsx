"use client";

import React, { useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Calendar, Hash, Tags, Type, User, X } from "lucide-react";
import type { TableColumnOption, TableColumnType } from "../../types/table";

export interface TableColumnTypeMenuProps {
  currentType: TableColumnType;
  options: TableColumnOption[];
  sortDir: "asc" | "desc" | null;
  filterOptionId: string | null;
  onSetType: (type: TableColumnType) => void;
  onAddOption: (label: string, color: string) => void;
  onRemoveOption: (id: string) => void;
  onSort: (dir: "asc" | "desc" | null) => void;
  onFilter: (optionId: string | null) => void;
}

const TYPE_CHOICES: { type: TableColumnType; label: string; Icon: typeof Type }[] = [
  { type: "text", label: "Text", Icon: Type },
  { type: "person", label: "Person", Icon: User },
  { type: "date", label: "Date", Icon: Calendar },
  { type: "number", label: "Number", Icon: Hash },
  { type: "select", label: "Select", Icon: Tags },
];

const OPTION_COLORS = ["#94a3b8", "#f87171", "#fb923c", "#facc15", "#4ade80", "#60a5fa", "#a78bfa", "#f472b6"];

/** Column-level settings popover, opened from the small gear on a header
 *  cell (see TableColumnHeaderControls.tsx). Column type/sort/filter apply
 *  to the whole column, unlike every other table control which is per-cell. */
export function TableColumnTypeMenu({
  currentType, options, sortDir, filterOptionId,
  onSetType, onAddOption, onRemoveOption, onSort, onFilter,
}: TableColumnTypeMenuProps) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColor, setDraftColor] = useState(OPTION_COLORS[0]);

  return (
    <div className="flex w-56 flex-col gap-2 p-2 text-xs">
      <div>
        <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Column type</div>
        <div className="grid grid-cols-5 gap-1">
          {TYPE_CHOICES.map(({ type, label, Icon }) => (
            <button
              key={type}
              type="button"
              title={label}
              aria-pressed={currentType === type}
              className={`flex flex-col items-center gap-0.5 rounded-md p-1.5 ${currentType === type ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
              onClick={() => onSetType(type)}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Sort</div>
        <div className="flex gap-1">
          <button type="button" aria-pressed={sortDir === "asc"} className={`flex items-center gap-1 rounded-md px-2 py-1 ${sortDir === "asc" ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`} onClick={() => onSort(sortDir === "asc" ? null : "asc")}>
            <ArrowUpAZ className="h-3.5 w-3.5" /> Asc
          </button>
          <button type="button" aria-pressed={sortDir === "desc"} className={`flex items-center gap-1 rounded-md px-2 py-1 ${sortDir === "desc" ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`} onClick={() => onSort(sortDir === "desc" ? null : "desc")}>
            <ArrowDownAZ className="h-3.5 w-3.5" /> Desc
          </button>
        </div>
      </div>

      {currentType === "select" && (
        <div>
          <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Options</div>
          <div className="flex flex-col gap-1">
            {options.map((opt) => (
              <div key={opt.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  title={filterOptionId === opt.id ? "Clear filter" : `Filter: ${opt.label}`}
                  className="flex flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                  style={filterOptionId === opt.id ? { outline: `1.5px solid ${opt.color}` } : undefined}
                  onClick={() => onFilter(filterOptionId === opt.id ? null : opt.id)}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
                  {opt.label}
                </button>
                <button type="button" aria-label={`Remove ${opt.label}`} className="text-slate-400 hover:text-rose-500" onClick={() => onRemoveOption(opt.id)}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1">
            <input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="Add option"
              className="min-w-0 flex-1 rounded border border-slate-200 bg-transparent px-1.5 py-1 text-xs dark:border-slate-700"
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !draftLabel.trim()) return;
                onAddOption(draftLabel.trim(), draftColor);
                setDraftLabel("");
              }}
            />
            <div className="flex gap-0.5">
              {OPTION_COLORS.slice(0, 4).map((color) => (
                <button key={color} type="button" title={color} className={`h-4 w-4 rounded-full ${draftColor === color ? "ring-2 ring-offset-1 ring-slate-400" : ""}`} style={{ backgroundColor: color }} onClick={() => setDraftColor(color)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TableColumnTypeMenu;
