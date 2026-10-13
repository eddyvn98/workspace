"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { TableCellAlignment, TableCellContent } from "../../types/table";
import { tableCellContentToHtml, htmlToTableCellContent } from "./tableCellContent";
import { TableCellEditorToolbar, type TableCellEditorCommand, WORKSPACE_TABLE_CELL_EDITOR_COMMAND_EVENT } from "./TableCellEditorToolbar";
import { parseClipboardGrid } from "../../utils/tablePasteOps";
import type { TableNavigationDirection } from "../../utils/tableKeyboard";

export interface TableCellEditorProps {
  cellId: string;
  content: TableCellContent;
  align: TableCellAlignment;
  fontSize: number;
  onChange: (content: TableCellContent) => void;
  onBlur: () => void;
  onCancel: (content: TableCellContent) => void;
  onNavigate: (direction: TableNavigationDirection, content: TableCellContent) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onPasteRange?: (grid: string[][]) => void;
  showToolbar?: boolean;
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function TableCellEditor({
  cellId,
  content,
  align,
  fontSize,
  onChange,
  onBlur,
  onCancel,
  onNavigate,
  onKeyDown,
  onPasteRange,
  showToolbar = true,
}: TableCellEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const activeCellRef = useRef<string | null>(null);
  const initialContentRef = useRef(content);

  useIsomorphicLayoutEffect(() => {
    if (!editorRef.current || activeCellRef.current === cellId) return;
    const html = tableCellContentToHtml(content);
    activeCellRef.current = cellId;
    initialContentRef.current = content;
    editorRef.current.innerHTML = html;
    editorRef.current.focus();
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [cellId, content]);

  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.focus();
  }, [cellId]);

  const getContent = useCallback(() => htmlToTableCellContent(editorRef.current?.innerHTML ?? ""), []);
  const emitContent = useCallback(() => onChange(getContent()), [getContent, onChange]);

  const runCommand = useCallback((command: TableCellEditorCommand) => {
    if (command.type === "toggle-mark") {
      document.execCommand(command.mark, false);
    } else if (command.type === "font-size") {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("fontSize", false, String(command.value));
    } else {
      const action = command.value === "left" ? "justifyLeft" : command.value === "center" ? "justifyCenter" : "justifyRight";
      document.execCommand(action, false);
    }
    emitContent();
    editorRef.current?.focus();
  }, [emitContent]);

  useEffect(() => {
    const handleExternalCommand = (event: Event) => {
      const command = (event as CustomEvent<TableCellEditorCommand>).detail;
      if (command) runCommand(command);
    };
    window.addEventListener(WORKSPACE_TABLE_CELL_EDITOR_COMMAND_EVENT, handleExternalCommand);
    return () => window.removeEventListener(WORKSPACE_TABLE_CELL_EDITOR_COMMAND_EVENT, handleExternalCommand);
  }, [runCommand]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel(initialContentRef.current);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      onNavigate(event.shiftKey ? "previous" : "next", getContent());
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onNavigate(event.shiftKey ? "up" : "down", getContent());
      return;
    }
    onKeyDown?.(event);
  };

  return (
    <div ref={rootRef} className="relative h-full w-full" onPointerDown={(event) => event.stopPropagation()}>
      {showToolbar && <TableCellEditorToolbar onCommand={runCommand} />}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Table cell editor"
        aria-multiline="true"
        data-table-cell-editor="true"
        onInput={emitContent}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        onPaste={(event) => {
          event.stopPropagation();
          const text = event.clipboardData.getData("text/plain");
          const grid = parseClipboardGrid(text);
          // A single pasted cell (no tab/newline) keeps the native contentEditable
          // paste so it can carry over bold/italic/etc. from the source; a real
          // range (Excel/Sheets/Miro TSV) fans out across cells instead.
          if (!onPasteRange || (grid.length <= 1 && grid[0]?.length <= 1)) return;
          event.preventDefault();
          onPasteRange(grid);
          // The paste already committed the whole range via onChange - exit
          // editing right away so a later Escape/blur on this cell can't
          // revert it back to initialContentRef's stale pre-paste value.
          onBlur();
        }}
        className="h-full w-full overflow-auto whitespace-pre-wrap break-words bg-transparent px-2 py-1.5 text-slate-900 outline-none dark:text-slate-100"
        style={{ fontSize: `${fontSize}px`, textAlign: align, lineHeight: 1.4 }}
      />
    </div>
  );
}
