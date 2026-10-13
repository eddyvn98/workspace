"use client";

import { useEffect, useState } from "react";
import { fetchRemoteBoard } from "./workspaceBoardApi";
import { wasBoardSelfCreated } from "../utils/selfCreatedBoards";
import { useWorkspaceRemoteBoardId } from "./useWorkspaceRemoteBoardId";

/**
 * Checks whether the current user is the owner of the board.
 * Calls GET /api/workspaces/${boardId} via fetchRemoteBoard and reads viewerRole.
 * Returns null while loading, then a boolean once the server has resolved the
 * viewer role. A new board can return 404 for the first render while autosave
 * creates it, so retry a few times before treating that response as a
 * persistent failure.
 * See CONTRACTS.md §29.
 */
export function useIsBoardOwner(boardId: string): boolean | null {
  const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
  const [isOwner, setIsOwner] = useState<boolean | null>(() => (
    boardId ? wasBoardSelfCreated(boardId) : null
  ));

  useEffect(() => {
    if (!boardId) {
      setIsOwner(null);
      return;
    }
    if (!remoteBoardId) {
      setIsOwner(wasBoardSelfCreated(boardId) ? true : null);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    setIsOwner(wasBoardSelfCreated(boardId) ? true : null);

    const loadOwner = async (attempt: number) => {
      const board = await fetchRemoteBoard(boardId);
      if (cancelled) return;
      if (board) {
        setIsOwner(board.viewerRole === "OWNER");
        return;
      }
      if (attempt < 3) {
        retryTimer = setTimeout(() => void loadOwner(attempt + 1), 500);
      } else if (!wasBoardSelfCreated(boardId)) {
        setIsOwner(false);
      }
    };

    void loadOwner(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [boardId, remoteBoardId]);

  return isOwner;
}

export default useIsBoardOwner;
