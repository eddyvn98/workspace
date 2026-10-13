"use client";

import { useEffect, useState } from "react";
import { boardKey } from "./workspaceBoardIndex";
import { wasBoardSelfCreated } from "../utils/selfCreatedBoards";

export const WORKSPACE_BOARD_PERSISTED_EVENT = "workspace-board-persisted";

function hasRemoteReadySnapshot(boardId: string | null): boolean {
  if (typeof window === "undefined" || !boardId) return false;
  if (!wasBoardSelfCreated(boardId)) return true;
  try {
    return Boolean(window.localStorage.getItem(boardKey(boardId)));
  } catch {
    return false;
  }
}

export function announceWorkspaceBoardPersisted(boardId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WORKSPACE_BOARD_PERSISTED_EVENT, { detail: boardId }));
}

/**
 * Keeps remote-only hooks quiet while a freshly-created board exists only in
 * memory. The first local snapshot is the same boundary used by autosave;
 * the custom event wakes the hooks immediately after that snapshot is written.
 */
export function useWorkspaceRemoteBoardId(boardId: string | null): string {
  const [ready, setReady] = useState(() => hasRemoteReadySnapshot(boardId));

  useEffect(() => {
    setReady(hasRemoteReadySnapshot(boardId));
    if (!boardId || !wasBoardSelfCreated(boardId)) return;

    const handlePersisted = (event: Event) => {
      if ((event as CustomEvent<string>).detail === boardId) setReady(true);
    };
    const handleStorage = () => setReady(hasRemoteReadySnapshot(boardId));
    window.addEventListener(WORKSPACE_BOARD_PERSISTED_EVENT, handlePersisted);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(WORKSPACE_BOARD_PERSISTED_EVENT, handlePersisted);
      window.removeEventListener("storage", handleStorage);
    };
  }, [boardId]);

  return ready ? boardId ?? "" : "";
}

export default useWorkspaceRemoteBoardId;
