"use client";

import React from "react";
import { SpreadsheetFileToolbar } from "./SpreadsheetFileToolbar";
import { useSpreadsheetFlush } from "./useSpreadsheetFlush";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { Workbook } from "@fortune-sheet/react";
import type { WorkbookInstance } from "@fortune-sheet/react";
import type { Range } from "@fortune-sheet/core";
import type { CanvasBlock } from "../../types/block";
import type { TableBlockPayload } from "../../types/table";
import { fortuneWorkbookToTablePatch, tableBlockToFortuneWorkbook } from "../../utils/workspaceTableWorkbook";
import { useWorkspaceSpreadsheetExternalSync } from "./useWorkspaceSpreadsheetExternalSync";
import { createSelectionRange, isSpreadsheetControl, tableDataSignature } from "./workspaceSpreadsheetEditorUtils";

export interface WorkspaceSpreadsheetEditorProps {
  block: CanvasBlock<"table">;
  onChange: (patch: Partial<TableBlockPayload>) => void;
  onClose: () => void;
  standalone?: boolean;
  fillParent?: boolean;
  hideHeader?: boolean;
  boardTitle?: string;
  boardId?: string;
  onDirtyChange?: (dirty: boolean) => void;
  allowEdit?: boolean;
  assistant?: React.ReactNode;
}

export function WorkspaceSpreadsheetEditor({
  block,
  onChange,
  onClose,
  standalone = false,
  fillParent = false,
  hideHeader = false,
  boardTitle,
  boardId,
  onDirtyChange,
  allowEdit = true,
  assistant,
}: WorkspaceSpreadsheetEditorProps) {
  const [mounted, setMounted] = React.useState(false);
  const sheets = React.useMemo(() => tableBlockToFortuneWorkbook(block, { expandEmptyGrid: true }), [block.id, block.data]);
  const sheet = sheets.find((candidate) => candidate.status === 1) ?? sheets[0];
  const rootRef = React.useRef<HTMLElement>(null);
  const closeRef = React.useRef(onClose); closeRef.current = onClose;
  const allowEditRef = React.useRef(allowEdit); allowEditRef.current = allowEdit;
  const workbookRef = React.useRef<WorkbookInstance>(null);
  const blockRef = React.useRef(block);
  blockRef.current = block;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const notifyChange = React.useCallback((patch: Partial<TableBlockPayload>) => {
    // A flush can synchronously emit a patch before React renders new props.
    // File export/backup must read that committed draft, never the old block.
    const current = blockRef.current;
    blockRef.current = { ...current, data: { ...current.data, ...patch } };
    onChangeRef.current(patch);
  }, []);
  const selectionRef = React.useRef<Range>([]);
  const activeSheetRef = React.useRef(sheet.id);
  React.useEffect(() => { activeSheetRef.current = sheet.id; }, [sheet.id]);
  const lastEmittedRef = React.useRef<string>(tableDataSignature(block.data));
  const dataSignature = tableDataSignature(block.data);
  const externalSyncVersion = useWorkspaceSpreadsheetExternalSync({
    dataSignature,
    lastEmittedRef,
  });
  const calculatedSignatureRef = React.useRef<string | null>(null);
  const pendingPatchRef = React.useRef<{ signature: string; data: Partial<TableBlockPayload> } | null>(null);
  const emitTimerRef = React.useRef<number | null>(null);
  const emitNow = React.useCallback(() => {
    if (emitTimerRef.current !== null) window.clearTimeout(emitTimerRef.current);
    emitTimerRef.current = null;
    const pending = pendingPatchRef.current; pendingPatchRef.current = null;
    if (!pending || !allowEditRef.current) return;
    lastEmittedRef.current = pending.signature;
    notifyChange(pending.data);
  }, [notifyChange]);
  const editing = useSpreadsheetFlush({ boardId, root: rootRef, emitNow, onDirtyChange });
  const getBlock = React.useCallback(() => blockRef.current, []);
  const formulaRefreshSignature = React.useMemo(() => JSON.stringify({ activeId: sheet.id, sheets: sheets.map((item) => ({
    id: item.id, cells: item.celldata?.map(({ r, c, v }) => [r, c, v?.v, v?.f]),
  })) }), [sheet.id, sheets]);

  const saveSelection = React.useCallback(() => {
    const selection = workbookRef.current?.getSelection();
    if (!selection?.length) return;
    selectionRef.current = selection.map((range) => ({ row: [...range.row], column: [...range.column] }));
  }, []);

  const restoreSelection = React.useCallback(() => {
    if (!selectionRef.current.length) return;
    const selection = selectionRef.current.map(createSelectionRange);
    workbookRef.current?.setSelection(selection);
  }, []);

  React.useEffect(() => {
    setMounted(true);
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape cancels an active cell/menu, not the entire Office page.
      if (event.key === "Escape" && !standalone && !(event.target instanceof Element && event.target.closest("input, textarea, [contenteditable], [role='dialog'], .fortune-container"))) closeRef.current();
    };
    const handleTabWhileEditing = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !allowEdit) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>(".luckysheet-cell-input")
        : null;
      const currentSelection = workbookRef.current?.getSelection()?.[0];
      if (!target || !currentSelection) return;
      const row = currentSelection.row[0];
      const column = currentSelection.column[0];
      if (row == null || column == null) return;
      const nextColumn = Math.max(0, Math.min((sheet.column ?? 1) - 1, column + (event.shiftKey ? -1 : 1)));
      event.preventDefault();
      event.stopPropagation();
      target.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }));
      window.setTimeout(() => {
        workbookRef.current?.setSelection([createSelectionRange({
          row: [row, row],
          column: [nextColumn, nextColumn],
        } as Range[number])]);
      }, 0);
    };
    const restoreAfterToolbarAction = (event: Event) => {
      if (!isSpreadsheetControl(event.target)) return;
      window.setTimeout(restoreSelection, 0);
    };
    const handleToolbarPointerDown = (event: Event) => {
      if (isSpreadsheetControl(event.target)) saveSelection();
    };
    document.addEventListener("pointerdown", handleToolbarPointerDown, true);
    document.addEventListener("click", restoreAfterToolbarAction, true);
    document.addEventListener("keydown", handleTabWhileEditing, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleToolbarPointerDown, true);
      document.removeEventListener("click", restoreAfterToolbarAction, true);
      document.removeEventListener("keydown", handleTabWhileEditing, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [allowEdit, standalone, restoreSelection, saveSelection, sheet.column]);

  React.useEffect(() => {
    if (!mounted || !sheet.id || formulaRefreshSignature === calculatedSignatureRef.current) return;
    const calculateTimer = window.setTimeout(() => {
      const workbook = workbookRef.current;
      if (!sheet.id || !workbook?.getAllSheets().some((candidate) => candidate.id === sheet.id)) return;
      calculatedSignatureRef.current = formulaRefreshSignature;
      workbook.calculateFormula(sheet.id);
    }, 0);
    return () => window.clearTimeout(calculateTimer);
  }, [formulaRefreshSignature, mounted, sheet.id, sheets]);

  const handleChange = React.useCallback((nextSheets: typeof sheet[]) => {
    if (!allowEditRef.current) return;
    const currentBlock = blockRef.current;
    const nextData = fortuneWorkbookToTablePatch(nextSheets, currentBlock, activeSheetRef.current);
    if (!nextData) return;
    const signature = tableDataSignature(nextData);
    if (signature === lastEmittedRef.current || pendingPatchRef.current?.signature === signature) return;
    pendingPatchRef.current = { signature, data: nextData };
    if (emitTimerRef.current !== null) return;
    emitTimerRef.current = window.setTimeout(() => {
      emitNow();
      editing.markClean();
    }, 0);
  }, [editing.markClean, emitNow]);

  const workbookHooks = React.useMemo(() => ({
    afterSelectionChange: (id: string) => {
      if (activeSheetRef.current === id) return;
      activeSheetRef.current = id;
      selectionRef.current = [];
      const current = workbookRef.current?.getAllSheets();
      if (current) handleChange(current);
    },
  }), [handleChange]);

  if (!mounted) return null;
  const editor = (
    <section ref={rootRef}
      onInputCapture={(event) => {
        if (!allowEdit || !(event.target instanceof Element)) return;
        const input = event.target.closest<HTMLElement>(".luckysheet-cell-input, .fortune-fx-input");
        if (input) editing.markDirty(input);
      }}
      className={standalone
        ? (fillParent ? "flex h-full w-full min-w-0 flex-col overflow-hidden bg-slate-50 dark:bg-slate-900" : "flex h-screen w-screen min-w-0 flex-col overflow-hidden bg-slate-50 dark:bg-slate-900")
        : "flex h-[min(820px,calc(100vh-32px))] w-[min(1280px,calc(100vw-32px))] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"}
    >
      {!hideHeader && <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-3">
          {standalone && (
            <button type="button" onClick={onClose} aria-label="Back to workspace" title="Back to workspace" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{boardTitle || "Spreadsheet editor"}</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Spreadsheet · formulas and formatting are saved automatically</p>
          </div>
        </div>
        {!standalone && (
          <button type="button" onClick={onClose} aria-label="Close spreadsheet editor" title="Close" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </header>}
      <SpreadsheetFileToolbar getBlock={getBlock} flush={editing.flush} onChange={notifyChange} allowEdit={allowEdit} title={boardTitle || "Spreadsheet"} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className={standalone ? "min-h-0 min-w-0 flex-1 p-3" : "min-h-0 min-w-0 flex-1 p-2"}>
          <div className="h-full w-full overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <Workbook
              key={`${block.id}:${externalSyncVersion}`}
              ref={workbookRef}
              data={sheets}
              allowEdit={allowEdit}
              showToolbar
              showFormulaBar
              showSheetTabs
              forceCalculation
              lang="en"
              onChange={handleChange}
              hooks={workbookHooks}
            />
          </div>
        </div>
        {assistant}
      </div>
    </section>
  );
  if (standalone) return editor;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Spreadsheet editor"
      data-workspace-spreadsheet-editor="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {editor}
    </div>,
    document.body,
  );
}

export default WorkspaceSpreadsheetEditor;
