"use client";

import { useMemo } from "react";
import type { BlockId, CanvasBlock } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

export function getHiddenBlocks(blocks: Record<BlockId, CanvasBlock>): Set<BlockId> {
  const hidden = new Set<BlockId>();
  const childrenByParent = new Map<BlockId, BlockId[]>();

  Object.values(blocks).forEach(b => {
    if (b.parentId) {
      if (!childrenByParent.has(b.parentId)) {
        childrenByParent.set(b.parentId, []);
      }
      childrenByParent.get(b.parentId)!.push(b.id);
    }
  });

  const traverseAndHide = (blockId: BlockId) => {
    const children = childrenByParent.get(blockId) || [];
    for (const childId of children) {
      hidden.add(childId);
      traverseAndHide(childId);
    }
  };

  Object.values(blocks).forEach(b => {
    if (b.isCollapsed) {
      traverseAndHide(b.id);
    }
  });

  return hidden;
}

export function useHiddenBlocks() {
  const blocks = useWorkspaceStore(state => state.blocks);
  return useMemo(() => getHiddenBlocks(blocks), [blocks]);
}
