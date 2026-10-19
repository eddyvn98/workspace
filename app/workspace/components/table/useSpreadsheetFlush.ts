"use client";
import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { registerWorkspaceEditorFlush } from "../../utils/workspaceEditorFlush";
interface Params {
  boardId?: string;
  root: RefObject<HTMLElement>;
  emitNow: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}
/** Fortune keeps the active text edit outside onChange until Enter. A plain
 * persistence flush does not include it, so commit it and drain the next task. */
export function useSpreadsheetFlush({ boardId, root, emitNow, onDirtyChange }: Params) {
  const dirtyInput = useRef<HTMLElement | null>(null);
  const dirty = useRef(false), callback = useRef(onDirtyChange);
  callback.current = onDirtyChange;
  const markDirty = useCallback((input?: HTMLElement) => { if (input) dirtyInput.current = input; if (!dirty.current) { dirty.current = true; callback.current?.(true); } }, []);
  const markClean = useCallback(() => { dirtyInput.current = null; if (dirty.current) { dirty.current = false; callback.current?.(false); } }, []);
  const flush = useCallback(async () => {
    const input = dirtyInput.current ?? root.current?.querySelector<HTMLElement>(".luckysheet-cell-input");
    if (input && input.getClientRects().length) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    emitNow(); markClean(); return true;
  }, [root, emitNow, markClean]);
  useEffect(() => { if (boardId) return registerWorkspaceEditorFlush(boardId, flush); }, [boardId, flush]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      emitNow(); event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("beforeunload", beforeUnload); emitNow(); };
  }, [emitNow]);
  return { flush, markDirty, markClean };
}
