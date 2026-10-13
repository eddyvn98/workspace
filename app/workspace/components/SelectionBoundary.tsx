"use client";

import React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { selectionScreenBounds, workspaceCanvasOrigin } from "../utils/blockRects";

export function SelectionBoundary() {
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const camera = useWorkspaceStore((state) => state.camera);
  if (selectedBlockIds.length < 2) {
    return null;
  }

  // Projected from the block transforms through the live camera instead of
  // measured off the DOM: a measured rect is one commit behind the transform
  // the browser is about to paint, which left this box trailing the blocks
  // for the whole duration of a wheel zoom.
  const bounds = selectionScreenBounds(blocks, selectedBlockIds, camera, workspaceCanvasOrigin());
  if (!bounds) {
    return null;
  }

  return (
    <div
      data-selection-boundary="true"
      className="fixed pointer-events-none z-30 border-2 border-dashed border-violet-500"
      style={{
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      }}
    />
  );
}

export default SelectionBoundary;
