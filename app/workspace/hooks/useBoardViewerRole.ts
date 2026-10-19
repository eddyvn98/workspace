"use client";

import { useLayoutEffect, useRef } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { fetchRemoteBoard } from "./workspaceBoardApi";
import { useWorkspaceRemoteBoardId } from "./useWorkspaceRemoteBoardId";

/**
 * Sets the store's `isReadOnly` flag from the caller's role on the open
 * board (see CONTRACTS.md §33). A validated viewer lock survives pending or
 * failed refreshes. New/local boards remain editable until a role is known;
 * the server remains authoritative for every write.
 */
export function useBoardViewerRole(boardId: string, forceReadOnly = false): void {
  const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
  const setIsReadOnly = useWorkspaceStore((state) => state.setIsReadOnly);
  const resolved = useRef<{ boardId: string; viewer: boolean } | null>(null);

  useLayoutEffect(() => {
    // Clear a different board's lock before paint, but never briefly unlock
    // a viewer whose access has already been validated for this board.
    const locked = forceReadOnly || resolved.current?.boardId === boardId && resolved.current.viewer;
    setIsReadOnly(Boolean(locked));
    if (forceReadOnly) {
      resolved.current = { boardId, viewer: true };
      return;
    }
    if (!remoteBoardId) return;
    let cancelled = false;

    void fetchRemoteBoard(remoteBoardId).then((board) => {
      if (cancelled || !board?.viewerRole) return;
      const viewer = board.viewerRole === "VIEWER";
      resolved.current = { boardId, viewer };
      setIsReadOnly(viewer);
    }).catch(() => { /* Keep the last validated role while offline. */ });

    return () => {
      cancelled = true;
    };
  }, [boardId, remoteBoardId, forceReadOnly, setIsReadOnly]);
}

export default useBoardViewerRole;
