"use client";

import { useEffect, useRef, useState } from "react";
import { fetchActiveViewers, sendPresenceHeartbeat, type WorkspaceViewer } from "./workspacePresenceApi";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useWorkspaceRemoteBoardId } from "./useWorkspaceRemoteBoardId";

const HEARTBEAT_INTERVAL_MS = 8_000;
const SELECTION_HEARTBEAT_DEBOUNCE_MS = 300;

/**
 * "Who else is viewing this board right now" — REST-heartbeat port of the
 * presence layer. Periodically sends a heartbeat with the caller's active selection
 * and editor focus, then refreshes the list of other active collaborators.
 */
export function useWorkspacePresence(boardId: string): WorkspaceViewer[] {
  const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
  const [viewers, setViewers] = useState<WorkspaceViewer[]>([]);
  const boardIdRef = useRef(remoteBoardId);
  boardIdRef.current = remoteBoardId;
  const lastSelectedBlockRef = useRef<string | null>(null);
  const lastEditingBlockRef = useRef<string | null>(null);

  useEffect(() => {
    if (!boardId) {
      setViewers([]);
      useWorkspaceStore.getState().setRemoteViewers([]);
      return;
    }
    let cancelled = false;
    let selectionTimeout: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled || !boardIdRef.current) return;
      const currentBoardId = boardIdRef.current;
      const state = useWorkspaceStore.getState();
      const selectedBlockId = state.selectedBlockIds[0] ?? null;
      const editingBlockId = state.editingBlockId ?? null;
      lastSelectedBlockRef.current = selectedBlockId;
      lastEditingBlockRef.current = editingBlockId;

      void sendPresenceHeartbeat(currentBoardId, selectedBlockId, editingBlockId);
      const list = await fetchActiveViewers(currentBoardId);
      if (cancelled || boardIdRef.current !== currentBoardId) return;
      setViewers(list);
      useWorkspaceStore.getState().setRemoteViewers(list);
    };

    // Initial heartbeat and viewer fetch
    void tick();
    const interval = setInterval(() => {
      void tick();
    }, HEARTBEAT_INTERVAL_MS);

    // Refresh presence immediately when user switches back to this browser tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Send heartbeat when selected block changes so collaborators see presence rings update promptly
    const unsubscribe = useWorkspaceStore.subscribe((state) => {
      const currentSelected = state.selectedBlockIds[0] ?? null;
      const currentEditing = state.editingBlockId ?? null;
      if (currentSelected !== lastSelectedBlockRef.current || currentEditing !== lastEditingBlockRef.current) {
        lastSelectedBlockRef.current = currentSelected;
        lastEditingBlockRef.current = currentEditing;
        if (selectionTimeout) clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(() => {
          if (!cancelled && boardIdRef.current) {
            void sendPresenceHeartbeat(boardIdRef.current, currentSelected, currentEditing);
          }
        }, SELECTION_HEARTBEAT_DEBOUNCE_MS);
      }
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (selectionTimeout) clearTimeout(selectionTimeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsubscribe();
      useWorkspaceStore.getState().setRemoteViewers([]);
    };
  }, [boardId, remoteBoardId]);

  return viewers;
}

export default useWorkspacePresence;
