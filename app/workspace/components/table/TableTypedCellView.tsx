import React from "react";
import type { TableColumnOption, TableColumnType } from "../../types/table";

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "")).toUpperCase();
}

function formatDate(raw: string): string {
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Read-mode rendering for a typed column's cell (see TableColumnType) -
 *  "text" never reaches here, it keeps using TableCellContentView's rich
 *  text. `rawValue` is `cells[row][col]` (a select option id, an ISO date,
 *  or a plain number/name string, depending on `columnType`). */
export function TableTypedCellView({ columnType, rawValue, options, fontSize }: {
  columnType: Exclude<TableColumnType, "text">;
  rawValue: string;
  options: TableColumnOption[];
  fontSize: number;
}) {
  if (columnType === "select") {
    const option = options.find((o) => o.id === rawValue || o.label === rawValue);
    if (!option) return <div className="h-full w-full truncate px-2 py-1.5" title={rawValue}>{rawValue}</div>;
    return (
      <div className="flex h-full w-full items-center px-2 py-1.5">
        <span className="inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundColor: option.color }}>
          {option.label}
        </span>
      </div>
    );
  }

  if (columnType === "person") {
    if (!rawValue) return <div className="h-full w-full px-2 py-1.5" />;
    return (
      <div className="flex h-full w-full items-center gap-1.5 truncate px-2 py-1.5" style={{ fontSize }}>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[9px] font-semibold text-slate-700 dark:bg-slate-600 dark:text-slate-100">
          {initials(rawValue)}
        </span>
        <span className="truncate">{rawValue}</span>
      </div>
    );
  }

  if (columnType === "date") {
    return <div className="h-full w-full truncate px-2 py-1.5" style={{ fontSize }}>{formatDate(rawValue)}</div>;
  }

  // number
  return <div className="h-full w-full truncate px-2 py-1.5 text-right tabular-nums" style={{ fontSize }}>{rawValue}</div>;
}

export default TableTypedCellView;
