"use client";

import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { resolveTransform, type Transform } from "../types/block";
import { useWorkspaceHistory } from "./useWorkspaceHistory";
import { useDeleteSelection } from "./useDeleteSelection";
import { useClipboard } from "./useClipboard";
import { useTreeAutoArrange } from "./useTreeAutoArrange";
import { useSiblingReorder } from "./useSiblingReorder";
import { useWorkspaceViewportControls } from "./useWorkspaceViewportControls";
import { isInsideWorkspaceKeyboardScope } from "../utils/workspaceKeyboardScope";
import { toggleBlockCollapse } from "../utils/toggleBlockCollapse";
import { useWorkspacePathCad } from "./useWorkspacePathCad";
import { currentMapLayout } from "../layout/mapRoot";
import type { UseSearchReplaceReturn } from "./useSearchReplace";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

export interface WorkspaceKeyboardShortcutsApi {
  isHelpOpen: boolean;
  setIsHelpOpen: (value: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Every global (non-input-focused) keyboard shortcut for the workspace
 *  canvas — undo/redo, clipboard, select-all, search, escape, delete,
 *  arrow-key nudge, help toggle, and the Tab/Enter tree auto-arrange flow
 *  (CONTRACTS.md §24). Extracted out of WorkspacePage.tsx purely to keep
 *  that file under the project's 300-line cap. */
export function useWorkspaceKeyboardShortcuts(
  searchReplace: UseSearchReplaceReturn,
): WorkspaceKeyboardShortcutsApi {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const blockOrder = useWorkspaceStore((state) => state.blockOrder);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const selectedConnectorId = useWorkspaceStore((state) => state.selectedConnectorId);
  const setSelectedConnectorId = useWorkspaceStore((state) => state.setSelectedConnectorId);
  const isCommentMode = useWorkspaceStore((state) => state.isCommentMode);
  const setIsCommentMode = useWorkspaceStore((state) => state.setIsCommentMode);
  const removeConnector = useWorkspaceStore((state) => state.removeConnector);
  const updateBlockTransform = useWorkspaceStore((state) => state.updateBlockTransform);

  const { undo, redo, canUndo, canRedo } = useWorkspaceHistory();
  const { copy, cut, paste } = useClipboard();
  const { deleteSelection, deleteSelectionPromoteChildren, canDelete } = useDeleteSelection();
  const { addChildBlock, addSiblingBlock, addParentBlock, addSummaryBlock } = useTreeAutoArrange();
  const { reorderSibling } = useSiblingReorder();
  const { handleFitView, centerOnBlock, zoomAtCenter } = useWorkspaceViewportControls();
  const setPendingEditBlockId = useWorkspaceStore((state) => state.setPendingEditBlockId);
  const updateBlock = useWorkspaceStore((state) => state.updateBlock);
  const { command: pathCadCommand, clear: clearPathCad } = useWorkspacePathCad();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "Escape" && isCommentMode) {
        event.preventDefault();
        setIsCommentMode(false);
        return;
      }
      if (event.key === "Escape" && pathCadCommand) {
        event.preventDefault();
        clearPathCad();
        return;
      }
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          Boolean(target.closest?.("[contenteditable]")))
      ) {
        return;
      }

      if (isInsideWorkspaceKeyboardScope(target)) return;

      // Undo: Ctrl+Z / Cmd+Z (no shift)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Y / Cmd+Y OR Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === "y" || event.key === "Y" || (event.shiftKey && (event.key === "z" || event.key === "Z")))
      ) {
        event.preventDefault();
        redo();
        return;
      }

      // Copy: Ctrl+C / Cmd+C (no shift)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "c" || event.key === "C")) {
        copy();
        return;
      }

      // Cut: Ctrl+X / Cmd+X (no shift)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "x" || event.key === "X")) {
        event.preventDefault();
        cut();
        return;
      }

      // Paste: Ctrl+V / Cmd+V (no shift)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "v" || event.key === "V")) {
        event.preventDefault();
        paste();
        return;
      }

      // Duplicate: Ctrl+D / Cmd+D (no shift)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "d" || event.key === "D")) {
        event.preventDefault();
        copy();
        paste();
        return;
      }

      // Select all: Ctrl+A / Cmd+A (no shift)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "a" || event.key === "A")) {
        event.preventDefault();
        setSelection([...blockOrder]);
        return;
      }

      // Search / Replace: Ctrl+F / Cmd+F (no shift)
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "f" || event.key === "F")) {
        event.preventDefault();
        searchReplace.open();
        return;
      }

      // Fit view: Ctrl+I / Cmd+I
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "i" || event.key === "I")) {
        event.preventDefault();
        handleFitView();
        return;
      }

      // Zoom shortcuts: keep the camera anchored to the viewport center, as
      // the legacy canvas does for Ctrl/Cmd +/-.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        zoomAtCenter(1.2);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === "-" || event.key === "_")) {
        event.preventDefault();
        zoomAtCenter(1 / 1.2);
        return;
      }

      // Ctrl/Cmd+Enter centers the viewport on the current map root, matching
      // the legacy shortcut even when no node is selected.
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        const blocks = useWorkspaceStore.getState().blocks;
        let rootId = selectedBlockIds[0] ?? blockOrder.find((id) => blocks[id] && !blocks[id].parentId) ?? "";
        const visited = new Set<string>();
        while (blocks[rootId]?.parentId && !visited.has(rootId)) {
          visited.add(rootId);
          rootId = blocks[rootId].parentId!;
        }
        if (!rootId || !blocks[rootId]) return;
        setSelection([rootId]);
        centerOnBlock(rootId);
        return;
      }

      // Create summary child: Ctrl+G / Cmd+G
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === "g" || event.key === "G")) {
        if (selectedBlockIds.length === 1) {
          event.preventDefault();
          addSummaryBlock(selectedBlockIds[0]);
        }
        return;
      }

      // F2: edit the selected text-bearing block
      if (event.key === "F2" && selectedBlockIds.length === 1) {
        if (isReadOnly) return;
        event.preventDefault();
        const selected = useWorkspaceStore.getState().blocks[selectedBlockIds[0]];
        if (selected?.type === "text" || selected?.type === "shape") setPendingEditBlockId(selected.id);
        return;
      }

      // Slash: toggle the selected tree branch
      if (event.key === "/" && selectedBlockIds.length === 1) {
        event.preventDefault();
        const selectedId = selectedBlockIds[0];
        const hasChildren = Object.values(useWorkspaceStore.getState().blocks).some(
          (block) => block.parentId === selectedId,
        );
        if (hasChildren) {
          toggleBlockCollapse(selectedId);
        }
        return;
      }

      // Insert: add child of the single selected block
      if (event.key === "Insert" && selectedBlockIds.length === 1) {
        if (currentMapLayout(useWorkspaceStore.getState(), selectedBlockIds[0]).family === "flowchart") return;
        event.preventDefault();
        addChildBlock(selectedBlockIds[0]);
        return;
      }

      // Tab / Shift+Tab: add child / parent of the single selected block.
      // Shapes and tables are freeform (no tree/parentId) — shapes get their
      // own hover "+" quick-add (ShapeQuickAddButtons) instead, matching
      // Lark's Board (no Tab/Enter node shortcuts there either). Falling
      // through here would otherwise still graft a tree-child text node onto
      // a shape or table.
      if (event.key === "Tab" && selectedBlockIds.length === 1) {
        if (currentMapLayout(useWorkspaceStore.getState(), selectedBlockIds[0]).family === "flowchart") return;
        const selectedType = useWorkspaceStore.getState().blocks[selectedBlockIds[0]]?.type;
        if (selectedType === "shape" || selectedType === "table") return;
        event.preventDefault();
        if (event.shiftKey) addParentBlock(selectedBlockIds[0]);
        else addChildBlock(selectedBlockIds[0]);
        return;
      }

      // Enter: add sibling of the single selected block (tree auto-arrange)
      if (event.key === "Enter" && !event.shiftKey && selectedBlockIds.length === 1) {
        if (currentMapLayout(useWorkspaceStore.getState(), selectedBlockIds[0]).family === "flowchart") return;
        event.preventDefault();
        addSiblingBlock(selectedBlockIds[0]);
        return;
      }

      // Sibling reorder: Ctrl+Up / Ctrl+Down (or Cmd+Up / Cmd+Down) for tree blocks (CONTRACTS.md §45)
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        selectedBlockIds.length === 1
      ) {
        event.preventDefault();
        reorderSibling(selectedBlockIds[0], event.key === "ArrowUp" ? "up" : "down");
        return;
      }

      // Escape follows the legacy priority: comment mode and armed CAD are
      // modes, so cancel them before touching the current selection.
      if (event.key === "Escape") {
        if (useWorkspaceStore.getState().formatPainterStyle !== null) {
          useWorkspaceStore.getState().setFormatPainterStyle(null);
          return;
        }
        setSelection([]);
        setSelectedConnectorId(null);
        return;
      }

      // Delete: Delete or Backspace
      if (event.key === "Delete" || event.key === "Backspace") {
        if (canDelete) {
          event.preventDefault();
          if (event.shiftKey) {
            if (!deleteSelectionPromoteChildren()) deleteSelection();
          }
          else deleteSelection();
        } else if (selectedConnectorId) {
          event.preventDefault();
          removeConnector(selectedConnectorId);
        }
        return;
      }

      // Nudge selection: Arrow keys (1px or 10px with Shift)
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        if (selectedBlockIds.length > 0) {
          event.preventDefault();
          const step = event.shiftKey ? 10 : 1;
          let dx = 0;
          let dy = 0;
          if (event.key === "ArrowUp") dy = -step;
          else if (event.key === "ArrowDown") dy = step;
          else if (event.key === "ArrowLeft") dx = -step;
          else if (event.key === "ArrowRight") dx = step;

          const currentBlocks = useWorkspaceStore.getState().blocks;
          selectedBlockIds.forEach((blockId) => {
            const block = currentBlocks[blockId];
            if (!block) return;
            const transform = resolveTransform(block.transform, DEFAULT_TRANSFORM);
            updateBlockTransform(blockId, { x: transform.x + dx, y: transform.y + dy }, "override");
          });
        }
        return;
      }

      // Toggle help: ?
      if (event.key === "?") {
        event.preventDefault();
        setIsHelpOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    undo,
    redo,
    isReadOnly,
    copy,
    cut,
    paste,
    setSelection,
    setSelectedConnectorId,
    selectedConnectorId,
    removeConnector,
    canDelete,
    deleteSelection,
    deleteSelectionPromoteChildren,
    selectedBlockIds,
    updateBlockTransform,
    blockOrder,
    searchReplace,
    addChildBlock,
    addSiblingBlock,
    addParentBlock,
    addSummaryBlock,
    reorderSibling,
    handleFitView,
    centerOnBlock,
    zoomAtCenter,
    setPendingEditBlockId,
    updateBlock,
    isCommentMode,
    setIsCommentMode,
    pathCadCommand,
    clearPathCad,
  ]);

  return { isHelpOpen, setIsHelpOpen, undo, redo, canUndo, canRedo };
}

export default useWorkspaceKeyboardShortcuts;
