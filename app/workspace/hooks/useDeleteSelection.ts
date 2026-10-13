"use client";

import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { deleteBlockPromoteChildren, deleteSubtree } from "../utils/treeSubtree";

export interface UseDeleteSelectionResult {
  deleteSelection: () => void;
  deleteSelectionPromoteChildren: () => boolean;
  canDelete: boolean;
}

/**
 * Hook to delete all currently selected blocks and any attached connectors
 * from the workspace store.
 */
export function useDeleteSelection(): UseDeleteSelectionResult {
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);

  const canDelete = selectedBlockIds.length > 0;

  const deleteSelection = useCallback(() => {
    if (selectedBlockIds.length === 0) return;

    // Delete each selected branch, including every descendant and connector.
    // deleteSubtree reads fresh store state for each target, so overlapping
    // selections (a parent and one of its children) remain safe.
    selectedBlockIds.forEach((id) => {
      deleteSubtree(id);
    });
  }, [selectedBlockIds]);

  const deleteSelectionPromoteChildren = useCallback(() => {
    if (selectedBlockIds.length !== 1) return false;
    return deleteBlockPromoteChildren(selectedBlockIds[0]);
  }, [selectedBlockIds]);

  return {
    deleteSelection,
    deleteSelectionPromoteChildren,
    canDelete,
  };
}

export default useDeleteSelection;
