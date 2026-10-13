"use client";

import React, { useState } from "react";
import { Settings2 } from "lucide-react";
import { WorkspaceSmartPopover as SmartPopover } from "../utils/WorkspaceSmartPopover";
import { TableColumnTypeMenu } from "../components/table/TableColumnTypeMenu";
import { getColumnOptions, getColumnType } from "../utils/tableColumnTypes";
import type { TableColumnOption, TableColumnType, TableFilterSpec, TableSortSpec } from "../types/table";

export interface TableColumnHeaderControlsProps {
  colWeights: number[];
  cols: number;
  columnTypes: TableColumnType[] | undefined;
  columnSelectOptions: Record<number, TableColumnOption[]> | undefined;
  sortCol: TableSortSpec | null | undefined;
  filterCol: TableFilterSpec | null | undefined;
  onSetType: (col: number, type: TableColumnType) => void;
  onAddOption: (col: number, label: string, color: string) => void;
  onRemoveOption: (col: number, id: string) => void;
  onSort: (col: number, dir: "asc" | "desc" | null) => void;
  onFilter: (col: number, optionId: string | null) => void;
}

/** One small gear button per column, sitting on top of the header row (only
 *  rendered when the table has one) - opens TableColumnTypeMenu for that
 *  column. Kept as its own overlay (like TableInsertHandles) rather than
 *  folded into TableCellContextMenu, since it's a column-wide setting, not a
 *  per-cell one, and needs to stay reachable without a right-click. */
export function TableColumnHeaderControls({
  colWeights, cols, columnTypes, columnSelectOptions, sortCol, filterCol,
  onSetType, onAddOption, onRemoveOption, onSort, onFilter,
}: TableColumnHeaderControlsProps) {
  const [openCol, setOpenCol] = useState<number | null>(null);
  const totalColWeight = colWeights.reduce((s, w) => s + w, 0) || 1;

  const boundaries: { col: number; leftPercent: number; widthPercent: number }[] = [];
  let cum = 0;
  for (let c = 0; c < cols; c++) {
    const leftPercent = (cum / totalColWeight) * 100;
    cum += colWeights[c] ?? 1;
    boundaries.push({ col: c, leftPercent, widthPercent: ((colWeights[c] ?? 1) / totalColWeight) * 100 });
  }

  return (
    <div style={{ position: "absolute", top: 2, left: 0, right: 0, height: 20, zIndex: 12 }}>
      {boundaries.map(({ col, leftPercent, widthPercent }) => (
        <div key={col} style={{ position: "absolute", left: `${leftPercent}%`, width: `${widthPercent}%`, height: "100%" }}>
          <button
            type="button"
            title="Column settings"
            aria-label="Column settings"
            className="absolute right-0.5 top-0 flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:bg-slate-200/70 hover:text-slate-600 dark:hover:bg-slate-700"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setOpenCol(openCol === col ? null : col);
            }}
          >
            <Settings2 className="h-3 w-3" />
          </button>
          {openCol === col && (
            <SmartPopover defaultH="left" className="!z-50" onClose={() => setOpenCol(null)}>
              <TableColumnTypeMenu
                currentType={getColumnType(columnTypes, col)}
                options={getColumnOptions(columnSelectOptions, col)}
                sortDir={sortCol?.col === col ? sortCol.dir : null}
                filterOptionId={filterCol?.col === col ? filterCol.optionId : null}
                onSetType={(type) => onSetType(col, type)}
                onAddOption={(label, color) => onAddOption(col, label, color)}
                onRemoveOption={(id) => onRemoveOption(col, id)}
                onSort={(dir) => onSort(col, dir)}
                onFilter={(optionId) => onFilter(col, optionId)}
              />
            </SmartPopover>
          )}
        </div>
      ))}
    </div>
  );
}

export default TableColumnHeaderControls;
