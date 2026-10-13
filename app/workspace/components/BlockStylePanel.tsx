"use client";

import React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { GroupStylePanel } from "./GroupStylePanel";

/**
 * Panel handling multi-selection group styling with legacy Mindmap parity.
 * Single-block selection styling is handled by WorkspaceSelectionToolbar.tsx.
 */
export function BlockStylePanel() {
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);

  if (selectedBlockIds.length < 2) {
    return null;
  }

  return <GroupStylePanel selectedBlockIds={selectedBlockIds} />;
}

export default BlockStylePanel;
