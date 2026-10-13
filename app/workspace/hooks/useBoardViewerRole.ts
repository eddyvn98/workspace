"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { fetchRemoteBoard } from "./workspaceBoardApi";
import { useWorkspaceRemoteBoardId } from "./useWorkspaceRemoteBoardId";

/**
 * Sets the store's `isReadOnly` flag from the caller's role on the open
 * board (see CONTRACTS.md §33). Fail-open on error/offline — a network
 * blip must not lock an owner or editor out of their own board; the server
 * is still the real authority (§21's 403 on every write), this is purely a
 * client-side UX improvement so a VIEWER doesn't fight with controls that
 * silently don't persist.
 */
export function useBoardViewerRole(boardId: string): void {
  const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
  const setIsReadOnly = useWorkspaceStore((state) => state.setIsReadOnly);

  useEffect(() => {
    // Route changes reuse the singleton store. Clear the previous board's
    // viewer lock immediately, otherwise a freshly-created board can remain
    // read-only before it has a remote snapshot (and its first map creation
    // is silently rejected by createWorkspaceMap).
    setIsReadOnly(false);
    if (!remoteBoardId) return;
    let cancelled = false;

    void fetchRemoteBoard(remoteBoardId).then((board) => {
      if (cancelled) return;
      setIsReadOnly(board?.viewerRole === "VIEWER");
    });

    return () => {
      cancelled = true;
    };
  }, [boardId, remoteBoardId, setIsReadOnly]);
}

export default useBoardViewerRole;
