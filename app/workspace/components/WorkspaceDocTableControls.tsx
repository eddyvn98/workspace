"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  ArrowDownToLine,
  Combine,
  Plus,
  Rows,
  Columns,
  SplitSquareHorizontal,
  Trash2,
  MoreHorizontal,
} from "lucide-react";

const controlButtonClass =
  "flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400";

function findTable(editor: Editor) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === "table") return { node, pos: $from.before(depth) };
  }
  return null;
}

function findCellDom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const cell = target.closest<HTMLElement>("td, th");
  return cell?.closest("[data-workspace-doc-table-id]") ? null : cell;
}

interface ContextMenuState {
  x: number;
  y: number;
}

interface MenuAction {
  label: string;
  icon: typeof Plus;
  run: (editor: Editor) => void;
  enabled: (editor: Editor) => boolean;
  danger?: boolean;
}

const MENU_ACTIONS: MenuAction[] = [
  { label: "Insert row above", icon: ArrowUpToLine, run: (e) => e.chain().focus().addRowBefore().run(), enabled: (e) => e.can().addRowBefore() },
  { label: "Insert row below", icon: ArrowDownToLine, run: (e) => e.chain().focus().addRowAfter().run(), enabled: (e) => e.can().addRowAfter() },
  { label: "Delete row", icon: Rows, run: (e) => e.chain().focus().deleteRow().run(), enabled: (e) => e.can().deleteRow(), danger: true },
  { label: "Insert column left", icon: ArrowLeftToLine, run: (e) => e.chain().focus().addColumnBefore().run(), enabled: (e) => e.can().addColumnBefore() },
  { label: "Insert column right", icon: ArrowRightToLine, run: (e) => e.chain().focus().addColumnAfter().run(), enabled: (e) => e.can().addColumnAfter() },
  { label: "Delete column", icon: Columns, run: (e) => e.chain().focus().deleteColumn().run(), enabled: (e) => e.can().deleteColumn(), danger: true },
  { label: "Merge cells", icon: Combine, run: (e) => e.chain().focus().mergeCells().run(), enabled: (e) => e.can().mergeCells() },
  { label: "Split cell", icon: SplitSquareHorizontal, run: (e) => e.chain().focus().splitCell().run(), enabled: (e) => e.can().splitCell() },
  { label: "Toggle header row", icon: Rows, run: (e) => e.chain().focus().toggleHeaderRow().run(), enabled: (e) => e.can().toggleHeaderRow() },
  { label: "Toggle header column", icon: Columns, run: (e) => e.chain().focus().toggleHeaderColumn().run(), enabled: (e) => e.can().toggleHeaderColumn() },
  { label: "Delete table", icon: Trash2, run: (e) => e.chain().focus().deleteTable().run(), enabled: (e) => e.can().deleteTable(), danger: true },
];

/**
 * Notion-style "+" controls for a table the cursor is currently inside —
 * add a column at the right edge, a row at the bottom edge, or delete the
 * whole table. TableKit ships the underlying addColumnAfter/addRowAfter/
 * deleteTable commands but no UI for them, and they act relative to
 * whichever cell the selection is already in — so "append at the very end"
 * first moves the selection into the table's last cell, then runs the
 * command from there. Positioned like WorkspaceDocSlashMenu.tsx: a portal
 * driven by the table DOM node's own bounding rect, recomputed on every
 * selection/doc update rather than tracked via ref-forwarding.
 */
export function WorkspaceDocTableControls({ editor }: { editor: Editor }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    const update = () => {
      if (editor.isDestroyed || !editor.isEditable) { setRect(null); return; }
      const table = findTable(editor);
      const wrapper = table ? (editor.view.nodeDOM(table.pos) as HTMLElement | null) : null;
      const dom = wrapper?.matches("table") ? wrapper : wrapper?.querySelector("table");
      const next = dom?.getBoundingClientRect() ?? null;
      setRect(next && next.bottom > 0 && next.top < window.innerHeight ? next : null);
    };
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("wheel", schedule, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(editor.view.dom);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("update", update);
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("wheel", schedule);
      observer?.disconnect();
    };
  }, [editor]);

  // Right-click anywhere inside a table cell opens the full row/column/merge
  // toolset — the "add column/add row/delete table" buttons below only cover
  // appending at the table's edges, not the fine-grained edits (insert
  // before, delete a specific row, merge/split, header toggles) a real table
  // editor needs. Moves the ProseMirror selection to the clicked cell first
  // so the menu's commands (which act on the current selection) hit the
  // right cell rather than wherever the caret happened to be before.
  useEffect(() => {
    const dom = editor.view.dom;
    const handleContextMenu = (event: MouseEvent) => {
      const cell = findCellDom(event.target);
      if (!cell || !editor.isEditable) return;
      event.preventDefault();
      // A drag-selected range of cells (CellSelection) is what makes "Merge
      // cells" available — collapsing it to a single text position here
      // (right-click always lands at one point) would silently turn a
      // multi-cell selection into a single-cell one before the menu can act
      // on it. Only move the selection when the click wasn't already inside
      // the existing cell/text selection.
      let withinSelectedCells = false;
      if (editor.state.selection instanceof CellSelection) editor.state.selection.forEachCell((_node, pos) => {
        if (editor.view.nodeDOM(pos) === cell) withinSelectedCells = true;
      });
      if (!withinSelectedCells) {
        const coords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (coords) editor.chain().setTextSelection(coords.pos).run();
      }
      setMenu({ x: event.clientX, y: event.clientY });
    };
    dom.addEventListener("contextmenu", handleContextMenu);
    return () => dom.removeEventListener("contextmenu", handleContextMenu);
  }, [editor]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); editor.commands.focus(); } };
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu, editor]);

  if (!rect && !menu) return null;

  const addColumn = () => {
    const table = findTable(editor);
    if (!table) return;
    const map = TableMap.get(table.node);
    const lastColumnCellPos = table.pos + 1 + map.map[map.width - 1];
    editor.chain().focus(lastColumnCellPos).addColumnAfter().run();
  };
  const addRow = () => {
    const table = findTable(editor);
    if (!table) return;
    const map = TableMap.get(table.node);
    const lastCellPos = table.pos + 1 + map.map[map.map.length - 1];
    editor.chain().focus(lastCellPos).addRowAfter().run();
  };
  const removeTable = () => editor.chain().focus().deleteTable().run();

  const runMenuAction = (action: MenuAction) => {
    action.run(editor);
    setMenu(null);
  };

  return createPortal(
    <>
      {rect && (
        <>
          <button
            type="button"
            title="Add column"
            aria-label="Add column"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addColumn}
            className={`${controlButtonClass} fixed z-40 w-4`}
            style={{ top: rect.top, left: rect.right + 4, height: rect.height }}
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Add row"
            aria-label="Add row"
            onMouseDown={(e) => e.preventDefault()}
            onClick={addRow}
            className={`${controlButtonClass} fixed z-40 h-4`}
            style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Delete table"
            aria-label="Delete table"
            onMouseDown={(e) => e.preventDefault()}
            onClick={removeTable}
            className={`${controlButtonClass} fixed z-40 h-6 w-6`}
            style={{ top: rect.top - 30, left: rect.left }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Table options" title="Table options" aria-haspopup="menu" aria-controls={menuId} aria-expanded={Boolean(menu)}
            onMouseDown={event => event.preventDefault()} onClick={() => setMenu({ x: rect.left, y: Math.max(8, rect.top) })}
            className={`${controlButtonClass} fixed z-40 h-6 w-6`} style={{ top: Math.max(8, rect.top - 30), left: rect.left + 30 }}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      {menu && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Table options"
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={event => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
          }}
          className="fixed z-50 max-h-[calc(100vh-16px)] min-w-[190px] overflow-auto rounded-lg border border-slate-200 bg-white/95 py-1 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
          style={{ top: Math.max(8, Math.min(menu.y, window.innerHeight - 400)), left: Math.max(8, Math.min(menu.x, window.innerWidth - 220)) }}
        >
          {MENU_ACTIONS.map((action, index) => {
            const Icon = action.icon;
            const disabled = !action.enabled(editor);
            const showDivider = index === 3 || index === 6 || index === 8;
            return (
              <div key={action.label}>
                {showDivider && <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={disabled}
                  onClick={() => runMenuAction(action)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                    action.danger ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30" : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {action.label}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>,
    document.body,
  );
}

export default WorkspaceDocTableControls;
