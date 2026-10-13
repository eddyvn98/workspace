"use client";

import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  type BlockId,
  type CanvasBlock,
} from "../types/block";
import { useClipboard } from "./useClipboard";
import { useFormatPainter } from "./useFormatPainter";
import { deleteSubtree } from "../utils/treeSubtree";
import { normalizeWorkspaceBlockZOrder } from "../utils/workspaceZOrder";

function cloneValue<T>(data: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(data);
    } catch {
      // Fallback
    }
  }
  return JSON.parse(JSON.stringify(data));
}

function getBlockDepthAndRoot(
  blockId: BlockId,
  blocks: Record<BlockId, CanvasBlock>
): { depth: number; rootId: BlockId } | null {
  const block = blocks[blockId];
  if (!block || !block.parentId) return null;

  let depth = 0;
  let curr: CanvasBlock | undefined = block;
  const visited = new Set<BlockId>();

  while (curr) {
    if (visited.has(curr.id)) break;
    visited.add(curr.id);

    if (!curr.parentId) {
      return { depth, rootId: curr.id };
    }

    const parent: CanvasBlock | undefined = blocks[curr.parentId];
    if (!parent) {
      return { depth, rootId: curr.id };
    }

    depth += 1;
    curr = parent;
  }

  return null;
}

export interface UseBlockContextMenuActionsResult {
  duplicateBlock: (blockId: BlockId) => void;
  deleteBlock: (blockId: BlockId) => void;
  bringToFront: (blockId: BlockId) => void;
  bringForward: (blockId: BlockId) => void;
  sendBackward: (blockId: BlockId) => void;
  sendToBack: (blockId: BlockId) => void;
  copyBlock: (blockId: BlockId) => void;
  cutBlock: (blockId: BlockId) => void;
  pasteBlock: (blockId: BlockId) => void;
  canPaste: boolean;
  copyStyle: (blockId: BlockId) => void;
  pasteStyle: (blockId: BlockId) => void;
  applyToSiblings: (blockId: BlockId) => void;
  applyToSameLevel: (blockId: BlockId) => void;
  editDescription: (blockId: BlockId, onStartEdit?: () => void) => void;
  editLink: (blockId: BlockId, onStartEdit?: () => void) => void;
  removeLink: (blockId: BlockId) => void;
  canPasteStyle: boolean;
}

/**
 * Hook providing context menu actions for a workspace block.
 */
export function useBlockContextMenuActions(
  onEditDescription?: (blockId: BlockId) => void,
  onEditLink?: (blockId: BlockId) => void
): UseBlockContextMenuActionsResult {
  const { copy, cut, paste, canPaste } = useClipboard();
  const { copyStyle: fpCopyStyle, applyStyle: fpApplyStyle, canApplyStyle } = useFormatPainter();

  const ensureSelected = (blockId: BlockId) => {
    const { selectedBlockIds, setSelection } = useWorkspaceStore.getState();
    if (!selectedBlockIds.includes(blockId)) {
      setSelection([blockId]);
    }
  };

  const copyBlock = useCallback((blockId: BlockId) => {
    ensureSelected(blockId);
    copy();
  }, [copy]);

  const cutBlock = useCallback((blockId: BlockId) => {
    ensureSelected(blockId);
    cut();
  }, [cut]);

  const pasteBlock = useCallback((blockId: BlockId) => {
    ensureSelected(blockId);
    paste(blockId);
  }, [paste]);

  const copyStyle = useCallback((blockId: BlockId) => {
    useWorkspaceStore.getState().setSelection([blockId]);
    fpCopyStyle();
  }, [fpCopyStyle]);

  const pasteStyle = useCallback((blockId: BlockId) => {
    ensureSelected(blockId);
    fpApplyStyle();
  }, [fpApplyStyle]);

  const applyToSiblings = useCallback((blockId: BlockId) => {
    const { blocks, updateBlock } = useWorkspaceStore.getState();
    const targetBlock = blocks[blockId];
    if (!targetBlock || !targetBlock.parentId) return;
    const styleToApply = targetBlock.style ? cloneValue(targetBlock.style) : {};

    Object.values(blocks).forEach((b) => {
      if (b.parentId === targetBlock.parentId && b.id !== blockId) {
        updateBlock(b.id, { style: cloneValue(styleToApply) });
      }
    });
  }, []);

  const applyToSameLevel = useCallback((blockId: BlockId) => {
    const { blocks, updateBlock } = useWorkspaceStore.getState();
    const targetBlock = blocks[blockId];
    if (!targetBlock || !targetBlock.parentId) return;
    const targetInfo = getBlockDepthAndRoot(blockId, blocks);
    if (!targetInfo) return;
    const styleToApply = targetBlock.style ? cloneValue(targetBlock.style) : {};

    Object.values(blocks).forEach((b) => {
      if (b.id === blockId) return;
      const info = getBlockDepthAndRoot(b.id, blocks);
      if (info && info.rootId === targetInfo.rootId && info.depth === targetInfo.depth) {
        updateBlock(b.id, { style: cloneValue(styleToApply) });
      }
    });
  }, []);

  const duplicateBlock = useCallback((blockId: BlockId) => {
    if (useWorkspaceStore.getState().isReadOnly) return;
    useWorkspaceStore.getState().setSelection([blockId]);
    copy();
    useWorkspaceStore.getState().setSelection([]);
    paste();
  }, [copy, paste]);

  const deleteBlock = useCallback((blockId: BlockId) => {
    deleteSubtree(blockId);
  }, []);

  const reorder = (blockId: BlockId, computeNewOrder: (order: BlockId[], idx: number) => BlockId[]) => {
    const { blockOrder, blocks, isReadOnly } = useWorkspaceStore.getState();
    if (isReadOnly) return;
    const idx = blockOrder.indexOf(blockId);
    if (idx === -1) return;
    const newOrder = computeNewOrder(blockOrder, idx);
    useWorkspaceStore.setState({ blockOrder: newOrder, blocks: normalizeWorkspaceBlockZOrder(blocks, newOrder) });
  };

  const bringToFront = useCallback((blockId: BlockId) => {
    reorder(blockId, (order) => [...order.filter((id) => id !== blockId), blockId]);
  }, []);

  const bringForward = useCallback((blockId: BlockId) => {
    reorder(blockId, (order, idx) => {
      if (idx === order.length - 1) return order;
      const next = [...order];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const sendBackward = useCallback((blockId: BlockId) => {
    reorder(blockId, (order, idx) => {
      if (idx <= 0) return order;
      const next = [...order];
      [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
      return next;
    });
  }, []);

  const sendToBack = useCallback((blockId: BlockId) => {
    reorder(blockId, (order) => [blockId, ...order.filter((id) => id !== blockId)]);
  }, []);

  const editDescription = useCallback(
    (blockId: BlockId, customOnEdit?: () => void) => {
      ensureSelected(blockId);
      if (customOnEdit) customOnEdit();
      else if (onEditDescription) onEditDescription(blockId);
    },
    [onEditDescription]
  );

  const editLink = useCallback(
    (blockId: BlockId, customOnEdit?: () => void) => {
      ensureSelected(blockId);
      if (customOnEdit) customOnEdit();
      else if (onEditLink) onEditLink(blockId);
    },
    [onEditLink]
  );

  const removeLink = useCallback((blockId: BlockId) => {
    useWorkspaceStore.getState().updateBlock(blockId, { link: undefined });
  }, []);

  return {
    duplicateBlock,
    deleteBlock,
    bringToFront,
    bringForward,
    sendBackward,
    sendToBack,
    copyBlock,
    cutBlock,
    pasteBlock,
    canPaste,
    copyStyle,
    pasteStyle,
    applyToSiblings,
    applyToSameLevel,
    editDescription,
    editLink,
    removeLink,
    canPasteStyle: canApplyStyle,
  };
}

export default useBlockContextMenuActions;
