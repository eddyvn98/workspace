"use client";

import React from "react";
import type { TableCellAlignment, TableCellContent, TableColumnOption, TableColumnType } from "../types/table";
import type { TableFormulaError } from "../utils/tableFormula";
import type { TableNavigationDirection } from "../utils/tableKeyboard";
import { TableCellContentView } from "../components/table/TableCellContentView";
import { TableCellEditor } from "../components/table/TableCellEditor";
import { TableTypedCellView } from "../components/table/TableTypedCellView";
import { TableTypedCellEditor } from "../components/table/TableTypedCellEditor";
import { tableCellContentToPlainText, textTableCellContent } from "../components/table/tableCellContent";

export interface TableCellProps {
  cellId: string;
  content: TableCellContent;
  editContent?: TableCellContent;
  fontSize: number;
  align: TableCellAlignment;
  isEditing: boolean;
  isSelected?: boolean;
  isRangeSelected?: boolean;
  columnType?: TableColumnType;
  columnOptions?: TableColumnOption[];
  onPointerDown?: () => void;
  showEditorToolbar?: boolean;
  onSelect?: () => void;
  onEnterEdit: () => void;
  onChange: (content: TableCellContent) => void;
  onBlur: () => void;
  onCancel: (content: TableCellContent) => void;
  onNavigate: (direction: TableNavigationDirection, content: TableCellContent) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onPasteRange?: (grid: string[][]) => void;
  formula?: string;
  formulaError?: TableFormulaError;
  allowFormula?: boolean;
}

export function TableCell({
  cellId,
  content,
  editContent,
  fontSize,
  align,
  isEditing,
  isSelected = false,
  isRangeSelected = false,
  columnType = "text",
  columnOptions = [],
  onPointerDown,
  showEditorToolbar = true,
  onSelect,
  onEnterEdit,
  onChange,
  onBlur,
  onCancel,
  onNavigate,
  onKeyDown,
  onPasteRange,
  formula,
  formulaError,
  allowFormula = false,
}: TableCellProps) {
  const rawValue = tableCellContentToPlainText(content);
  const viewRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isEditing && isSelected) viewRef.current?.focus();
  }, [isEditing, isSelected]);
  // "select"/"date"/"number" bypass rich text entirely (view AND edit); a
  // "person" cell is still free text underneath, just displayed with an
  // avatar - so it keeps the normal rich-text editor.
  const hasTypedEditor = !allowFormula && (columnType === "select" || columnType === "date" || columnType === "number");
  // Formula mode changes the editor, not how typed values are displayed.
  // Keep select labels/colors visible in spreadsheet tables too.
  const hasTypedView = columnType === "select" || columnType === "date" || columnType === "number" || columnType === "person";

  if (isEditing && hasTypedEditor) {
    return (
      <TableTypedCellEditor
        columnType={columnType}
        rawValue={rawValue}
        options={columnOptions}
        onChange={(next) => onChange({ version: 1, blocks: [{ type: "paragraph", runs: [{ text: next }] }] })}
        onNavigate={(direction, next) => onNavigate(direction, textTableCellContent(next))}
        onCancel={() => onCancel(textTableCellContent(rawValue))}
        onBlur={onBlur}
      />
    );
  }

  if (isEditing) {
    return (
      <TableCellEditor
        cellId={cellId}
        content={editContent ?? content}
        align={align}
        fontSize={fontSize}
        onChange={onChange}
        onBlur={onBlur}
        onCancel={onCancel}
        onNavigate={onNavigate}
        onKeyDown={onKeyDown}
        onPasteRange={onPasteRange}
        showToolbar={showEditorToolbar}
      />
    );
  }

  return (
    <div
      role="gridcell"
      ref={viewRef}
      tabIndex={isSelected ? 0 : -1}
      onPointerDown={(event) => { event.stopPropagation(); onPointerDown?.(); }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
        onEnterEdit();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        onKeyDown(event);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onEnterEdit();
      }}
      className={`h-full w-full cursor-text overflow-hidden text-slate-900 dark:text-slate-100${isRangeSelected ? " bg-blue-100/70 dark:bg-blue-900/30" : ""}${isSelected ? " ring-1 ring-inset ring-blue-500 bg-blue-50/70 dark:bg-blue-950/30" : ""}${formulaError ? " text-red-600 dark:text-red-400" : ""}`}
      aria-label={formula ? `Formula cell ${formula}` : "Table cell"}
      data-workspace-table-formula={formula || undefined}
      title={rawValue || undefined}
      aria-selected={isSelected}
      data-workspace-table-cell-view="true"
    >
      {hasTypedView
        ? <TableTypedCellView columnType={columnType as Exclude<TableColumnType, "text">} rawValue={rawValue} options={columnOptions} fontSize={fontSize} />
        : <TableCellContentView content={content} align={align} fontSize={fontSize} />}
    </div>
  );
}

export default TableCell;
