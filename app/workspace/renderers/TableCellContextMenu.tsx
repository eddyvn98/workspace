"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Combine, Copy, Trash2, Ungroup } from "lucide-react";
import { TableCellColorMenu } from "../components/table/TableCellColorMenu";

export interface TableCellContextMenuProps {
  position: { x: number; y: number };
  rowIndex: number;
  colIndex: number;
  rows: number;
  cols: number;
  onInsertRowAbove: () => void;
  onInsertRowBelow: () => void;
  onInsertColLeft: () => void;
  onInsertColRight: () => void;
  onDeleteRow: () => void;
  onDeleteCol: () => void;
  onDuplicateRow: () => void;
  onDuplicateCol: () => void;
  onMoveRowUp: () => void;
  onMoveRowDown: () => void;
  onMoveColLeft: () => void;
  onMoveColRight: () => void;
  onMergeRight: () => void;
  onMergeDown: () => void;
  onUnmerge: () => void;
  isMerged: boolean;
  bgColor?: string;
  textColor?: string;
  onSetBgColor: (color: string | undefined) => void;
  onSetTextColor: (color: string | undefined) => void;
  onClose: () => void;
}

const itemClass =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800";
const dangerItemClass =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rose-950/30";
const dividerClass = "my-1 border-t border-slate-200 dark:border-slate-800";

export const TableCellContextMenu: React.FC<TableCellContextMenuProps> = ({
  position,
  rowIndex,
  colIndex,
  rows,
  cols,
  onInsertRowAbove,
  onInsertRowBelow,
  onInsertColLeft,
  onInsertColRight,
  onDeleteRow,
  onDeleteCol,
  onDuplicateRow,
  onDuplicateCol,
  onMoveRowUp,
  onMoveRowDown,
  onMoveColLeft,
  onMoveColRight,
  onMergeRight,
  onMergeDown,
  onUnmerge,
  isMerged,
  bgColor,
  textColor,
  onSetBgColor,
  onSetTextColor,
  onClose,
}) => {
  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  const rowColActions: { label: string; Icon: typeof Copy; run: () => void; disabled?: boolean }[] = [
    { label: "Duplicate row", Icon: Copy, run: onDuplicateRow, disabled: false },
    { label: "Duplicate column", Icon: Copy, run: onDuplicateCol, disabled: false },
    { label: "Move row up", Icon: ArrowUp, run: onMoveRowUp, disabled: rowIndex <= 0 },
    { label: "Move row down", Icon: ArrowDown, run: onMoveRowDown, disabled: rowIndex >= rows - 1 },
    { label: "Move column left", Icon: ArrowLeft, run: onMoveColLeft, disabled: colIndex <= 0 },
    { label: "Move column right", Icon: ArrowRight, run: onMoveColRight, disabled: colIndex >= cols - 1 },
  ];
  const mergeActions: { label: string; Icon: typeof Combine; run: () => void; disabled?: boolean }[] = isMerged
    ? [{ label: "Unmerge cell", Icon: Ungroup, run: onUnmerge, disabled: false }]
    : [
        { label: "Merge with cell to the right", Icon: Combine, run: onMergeRight, disabled: colIndex >= cols - 1 },
        { label: "Merge with cell below", Icon: Combine, run: onMergeDown, disabled: rowIndex >= rows - 1 },
      ];
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const left =
    typeof window !== "undefined"
      ? Math.min(position.x, window.innerWidth - 220)
      : position.x;
  const top =
    typeof window !== "undefined"
      ? Math.min(position.y, window.innerHeight - 460)
      : position.y;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Table cell actions row ${rowIndex + 1} column ${colIndex + 1}`}
      data-table-context-menu="true"
      className="fixed z-[100] max-h-[85vh] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          onInsertRowAbove();
          onClose();
        }}
      >
        <ArrowUp className="h-3.5 w-3.5" />
        Insert row above
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          onInsertRowBelow();
          onClose();
        }}
      >
        <ArrowDown className="h-3.5 w-3.5" />
        Insert row below
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          onInsertColLeft();
          onClose();
        }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Insert column left
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        onClick={() => {
          onInsertColRight();
          onClose();
        }}
      >
        <ArrowRight className="h-3.5 w-3.5" />
        Insert column right
      </button>

      <div className={dividerClass} />

      {rowColActions.map(({ label, Icon, run: action, disabled }) => (
        <button key={label} type="button" role="menuitem" disabled={disabled} className={itemClass} onClick={run(action)}>
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}

      <div className={dividerClass} />

      {mergeActions.map(({ label, Icon, run: action, disabled }) => (
        <button key={label} type="button" role="menuitem" disabled={disabled} className={itemClass} onClick={run(action)}>
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}

      <div className={dividerClass} />

      <TableCellColorMenu bgColor={bgColor} textColor={textColor} onSetBgColor={onSetBgColor} onSetTextColor={onSetTextColor} />

      <div className={dividerClass} />

      <button
        type="button"
        role="menuitem"
        disabled={rows <= 1}
        className={dangerItemClass}
        onClick={() => {
          onDeleteRow();
          onClose();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete this row
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={cols <= 1}
        className={dangerItemClass}
        onClick={() => {
          onDeleteCol();
          onClose();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete this column
      </button>
    </div>,
    document.body
  );
};
