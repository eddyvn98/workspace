"use client";

import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { BlockId } from "../types/block";
import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";

export interface SiblingReorderApi {
  reorderSibling: (blockId: BlockId, direction: "up" | "down") => void;
}

/**
 * Sibling reorder hook (Ctrl+Up / Ctrl+Down) for tree blocks — CONTRACTS.md §45.
 * Swaps a tree block's position with its adjacent sibling (same parentId)
 * and triggers tree layout reflow without modifying parentId, override, or style.
 */
export function useSiblingReorder(): SiblingReorderApi {
  const reorderSibling = useCallback((blockId: BlockId, direction: "up" | "down") => {
    const state = useWorkspaceStore.getState();
    if (state.isReadOnly) return;

    const targetBlock = state.blocks[blockId];
    if (!targetBlock || !targetBlock.parentId) return;

    const parentId = targetBlock.parentId;
    const parentBlock = state.blocks[parentId];
    if (!parentBlock) return;

    // Filter siblings in current blockOrder order
    const siblings = state.blockOrder.filter(
      (id) => state.blocks[id]?.parentId === parentId
    );
    // Include any siblings that might be missing from blockOrder just in case
    for (const [id, block] of Object.entries(state.blocks)) {
      if (block.parentId === parentId && !siblings.includes(id as BlockId)) {
        siblings.push(id as BlockId);
      }
    }

    const currentIndex = siblings.indexOf(blockId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      // No-op at either end of the sibling list
      return;
    }

    const otherBlockId = siblings[targetIndex];
    const idxA = state.blockOrder.indexOf(blockId);
    const idxB = state.blockOrder.indexOf(otherBlockId);

    let newBlockOrder = [...state.blockOrder];
    if (idxA !== -1 && idxB !== -1) {
      newBlockOrder[idxA] = otherBlockId;
      newBlockOrder[idxB] = blockId;
    } else {
      const newSiblings = [...siblings];
      newSiblings[currentIndex] = otherBlockId;
      newSiblings[targetIndex] = blockId;
      newBlockOrder = state.blockOrder.filter((id) => !newSiblings.includes(id));
      newBlockOrder.push(...newSiblings);
    }

    state.setBlockOrder(newBlockOrder);

    // Walk up to the tree's root so descendants reflow correctly.
    reflowWorkspaceTree(parentId);
  }, []);

  return { reorderSibling };
}

export default useSiblingReorder;
