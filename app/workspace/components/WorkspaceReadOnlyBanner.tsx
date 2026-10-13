"use client";

import React from "react";
import { Eye } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

/** Small banner shown while `isReadOnly` (a VIEWER collaborator) — see
 *  CONTRACTS.md §33. Purely informational; the store's mutators already
 *  no-op every write, this just explains why nothing the user does seems
 *  to "stick". */
export function WorkspaceReadOnlyBanner() {
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  if (!isReadOnly) return null;

  return (
    <div
      className="absolute top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/95 px-3 py-1 text-xs font-medium text-amber-700 shadow-md backdrop-blur dark:border-amber-900 dark:bg-amber-950/90 dark:text-amber-300"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Eye className="h-3.5 w-3.5" />
      View only
    </div>
  );
}

export default WorkspaceReadOnlyBanner;
