"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

/**
 * Consumes a "Copy link to block" URL (?focusBlock=<blockId>&focusLine=<id>,
 * see useWorkspaceDocLineActions.ts's copyLink) once per board load: queues
 * the target block into edit mode and the target line into
 * pendingFocusLineId (useWorkspaceStore.ts), then strips both params from
 * the URL so re-rendering or reloading doesn't re-trigger the jump.
 * WorkspaceDocLineOverlay.tsx does the actual scroll/highlight once its
 * editor mounts and finds the matching lineId.
 */
export function useWorkspaceFocusLineFromUrl(boardId: string | null) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusBlock = searchParams.get("focusBlock");
  const focusLine = searchParams.get("focusLine");

  useEffect(() => {
    if (!boardId || !focusBlock || !focusLine) return;
    // Every other setPendingEditBlockId caller also selects the block first
    // (WorkspaceAddBlockButtons.tsx, useTreeAutoArrange.ts, …) — DocBlock's
    // own "!isSelected && isEditing -> stopEditing()" effect exits edit mode
    // right back out again if the block never became selected.
    useWorkspaceStore.getState().setSelection([focusBlock]);
    useWorkspaceStore.getState().setPendingEditBlockId(focusBlock);
    useWorkspaceStore.getState().setPendingFocusLineId(focusLine);
    router.replace(`/workspace?id=${boardId}`);
  }, [boardId, focusBlock, focusLine, router]);
}

export default useWorkspaceFocusLineFromUrl;
