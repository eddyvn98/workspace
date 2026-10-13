"use client";

import React from "react";
import { Calculator, ExternalLink, GripVertical, Maximize2, Table2, LayoutGrid } from "lucide-react";
import { fromTableBlock } from "../collections/io";
import { createBlockId, createDualTransform, resolveTransform } from "../types/block";
import type { BlockId, CanvasBlock } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { TableMode } from "../types/table";
import { TableCellEditorToolbar, type TableCellEditorCommand } from "./table/TableCellEditorToolbar";
import { requestSpreadsheetEditor } from "./table/workspaceTableEvents";

export interface WorkspaceTableSelectionToolbarProps {
  block: CanvasBlock<"table">;
  /** Kept for compatibility with the legacy canvas toolbar integration. */
  id?: BlockId;
  toolbarRef: React.RefObject<HTMLDivElement>;
  style: { left: number; top: number } | null;
  onToggleHeaderRow?: () => void;
  onCellCommand: (command: TableCellEditorCommand) => void;
  onDragStart?: (event: React.MouseEvent | React.TouchEvent | React.PointerEvent) => void;
  onMoveToCanvas?: () => void;
  position?: "fixed" | "absolute";
}

export function WorkspaceTableSelectionToolbar({
  block,
  id,
  toolbarRef,
  style,
  onToggleHeaderRow,
  onCellCommand,
  onDragStart,
  onMoveToCanvas,
  position = "fixed",
}: WorkspaceTableSelectionToolbarProps) {
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const addBlock = useWorkspaceStore((state) => state.addBlock);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const boardId = useWorkspaceStore((state) => state.boardId);
  const mode: TableMode = block.data?.mode === "spreadsheet" ? "spreadsheet" : "document";
  const isStructuralTable = Boolean(block.data?.disableCellAttachment);
  const legacySurface = Boolean(id && onToggleHeaderRow);
  const changeMode = (nextMode: TableMode) => {
    if (isStructuralTable || nextMode === mode) return;
    updateBlock(block.id, { data: { ...block.data, mode: nextMode } });
  };

  const createFromTable = () => {
    if (isReadOnly || isStructuralTable) return;
    const frame = resolveTransform(block.transform, { x: 0, y: 0, w: 480, h: 300, rotation: 0, zIndex: 0 });
    const now = Date.now();
    const collection: CanvasBlock<"collection"> = {
      id: createBlockId(), type: "collection",
      transform: createDualTransform({ ...frame, x: frame.x + frame.w + 80, w: 900, h: 540 }),
      data: fromTableBlock(block), createdAt: now, updatedAt: now,
    };
    addBlock(collection);
    setSelection([collection.id]);
  };

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label={legacySurface ? "Table editor" : "Table controls"}
      data-table-editor-toolbar="true"
      onPointerDown={(event) => event.stopPropagation()}
      style={style ?? { top: 80, left: 16 }}
      className={`${position} z-50 flex w-max max-w-[calc(100vw-128px)] flex-wrap items-center gap-2 overflow-visible rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 select-none`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <div
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          className="-ml-0.5 flex-shrink-0 cursor-grab touch-none p-0.5 text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-slate-400"
          title="Drag to reposition toolbar"
          aria-label="Drag toolbar"
        >
          <GripVertical className="h-4 w-4 shrink-0" aria-hidden="true" />
        </div>
        {!isStructuralTable && (
          <div className="flex items-center rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label="Table mode">
            {(["document", "spreadsheet"] as const).map((nextMode) => {
              const active = mode === nextMode;
              const Icon = nextMode === "document" ? Table2 : Calculator;
              return (
                <button
                  key={nextMode}
                  type="button"
                  aria-pressed={active}
                  aria-label={nextMode === "document" ? "Document table" : "Spreadsheet table"}
                  title={nextMode === "document" ? "Document table" : "Spreadsheet table with formulas"}
                  onClick={() => changeMode(nextMode)}
                  className={`flex items-center justify-center rounded-md p-1.5 transition ${active ? "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
        {mode === "spreadsheet" && !isStructuralTable && (
          <button
            type="button"
            onClick={() => requestSpreadsheetEditor(block.id, boardId)}
            className="flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            title="Open spreadsheet in a new tab"
            aria-label="Open spreadsheet in a new tab"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        {!isStructuralTable && <button type="button" className="flex items-center gap-1 rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300" title="Create a collection from this table (original stays unchanged)" disabled={isReadOnly} onClick={createFromTable}><LayoutGrid className="h-3.5 w-3.5" /><span>To Collection</span></button>}
        {onMoveToCanvas && (
          <button type="button" onClick={onMoveToCanvas} className="flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100" title="Move table to canvas" aria-label="Move table to canvas">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        <TableCellEditorToolbar onCommand={onCellCommand} embedded />
      </div>
    </div>
  );
}

export default WorkspaceTableSelectionToolbar;
