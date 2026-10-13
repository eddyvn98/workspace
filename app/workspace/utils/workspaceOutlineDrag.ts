import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { collectSubtreeBlockIds } from "./treeSubtree";
import type { BlockId } from "../types/block";

export type OutlineDropPosition = "before" | "after" | "inside";

/** Applies the legacy outline drop contract to the flat Workspace tree model. */
export function moveWorkspaceOutlineBlock(
  draggedId: BlockId,
  targetId: BlockId,
  requestedPosition: OutlineDropPosition,
): void {
  const state = useWorkspaceStore.getState();
  const dragged = state.blocks[draggedId];
  const target = state.blocks[targetId];
  if (state.isReadOnly || !dragged || !target || draggedId === targetId) return;

  const draggedSubtree = collectSubtreeBlockIds(draggedId, state.blocks);
  if (draggedSubtree.has(targetId)) return;

  let position = requestedPosition;
  let newParentId: BlockId | undefined = position === "inside" ? targetId : target.parentId;
  if (position !== "inside" && !newParentId) {
    position = "inside";
    newParentId = targetId;
  }

  const nextOrder = state.blockOrder.filter((id) => !draggedSubtree.has(id));
  const targetSubtree = collectSubtreeBlockIds(targetId, state.blocks);
  const targetIndex = nextOrder.indexOf(targetId);
  const targetSubtreeIndexes = nextOrder
    .map((id, index) => targetSubtree.has(id) ? index : -1)
    .filter((index) => index >= 0);
  if (targetIndex < 0 || targetSubtreeIndexes.length === 0) return;

  const insertIndex = position === "before"
    ? targetIndex
    : Math.max(...targetSubtreeIndexes) + 1;
  const movedIds = state.blockOrder.filter((id) => draggedSubtree.has(id));
  nextOrder.splice(insertIndex, 0, ...movedIds);

  const oldParentId = dragged.parentId;
  useWorkspaceStore.setState((current) => current.isReadOnly ? current : {
    blocks: {
      ...current.blocks,
      [draggedId]: {
        ...dragged,
        parentId: newParentId,
        isFloating: false,
        updatedAt: Date.now(),
        lastEditedBy: current.currentUserEmail ?? dragged.lastEditedBy,
      },
    },
    blockOrder: nextOrder,
  });

  const rootsToReflow = new Set([oldParentId, newParentId].filter(Boolean) as BlockId[]);
  rootsToReflow.forEach((rootId) => reflowWorkspaceTree(rootId));
}
