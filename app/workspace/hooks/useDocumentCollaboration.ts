"use client";
import { useCallback, useSyncExternalStore } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { documentFragments } from "@/lib/workspace/ydoc-documents";
import { getDocumentSession, subscribeDocumentSession } from "@/lib/workspace/document-session";
import { useWorkspaceRemoteBoardId } from "./useWorkspaceRemoteBoardId";

export function useDocumentCollaboration(blockId: string) {
  const boardId = useWorkspaceStore(state => state.boardId);
  const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
  const getSnapshot = useCallback(() => {
    const session = getDocumentSession();
    return session && [boardId, remoteBoardId].includes(session.boardId) ? documentFragments(session.doc).get(blockId) ?? null : null;
  }, [boardId, remoteBoardId, blockId]);
  return useSyncExternalStore(subscribeDocumentSession, getSnapshot, () => null);
}
