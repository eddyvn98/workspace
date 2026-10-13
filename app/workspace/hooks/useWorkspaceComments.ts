"use client";

import { useEffect } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { fetchBoardComments, type WorkspaceComment } from "./workspaceCommentApi";
import { useWorkspaceRemoteBoardId } from "./useWorkspaceRemoteBoardId";

// Workspace has no comments WebSocket channel yet; keep the visible badge and
// panel close to the legacy realtime experience without importing the legacy
// mindmap transport into the new engine.
const POLL_INTERVAL_MS = 2_000;

function sameComment(a: WorkspaceComment, b: WorkspaceComment): boolean {
  return a.id === b.id
    && a.boardId === b.boardId
    && a.blockId === b.blockId
    && a.authorEmail === b.authorEmail
    && a.body === b.body
    && a.resolved === b.resolved
    && a.createdAt === b.createdAt
    && a.updatedAt === b.updatedAt
    && a.parentId === b.parentId;
}

/** Preserve mutations that happened after a poll request started. */
export function mergePolledComments(
  serverComments: WorkspaceComment[],
  requestSnapshot: WorkspaceComment[],
  currentComments: WorkspaceComment[],
): WorkspaceComment[] {
  const snapshotById = new Map(requestSnapshot.map((comment) => [comment.id, comment]));
  const currentById = new Map(currentComments.map((comment) => [comment.id, comment]));
  const locallyRemoved = new Set(
    requestSnapshot.filter((comment) => !currentById.has(comment.id)).map((comment) => comment.id),
  );
  const locallyChanged = currentComments.filter((comment) => {
    const previous = snapshotById.get(comment.id);
    return !previous || !sameComment(previous, comment);
  });
  const changedById = new Map(locallyChanged.map((comment) => [comment.id, comment]));
  const merged = serverComments
    .filter((comment) => !locallyRemoved.has(comment.id))
    .map((comment) => changedById.get(comment.id) ?? comment);
  const seen = new Set(merged.map((comment) => comment.id));
  for (const comment of locallyChanged) {
    if (!seen.has(comment.id)) merged.push(comment);
  }
  return merged;
}

/**
 * Keeps the store's `comments` in sync with the server — short REST polling
 * approximates the legacy realtime cadence while this engine has no comments
 * WebSocket channel. Call once per mounted board (WorkspacePage).
 */
export function useWorkspaceComments(boardId: string): void {
  const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
  const setComments = useWorkspaceStore((state) => state.setComments);

  useEffect(() => {
    if (!remoteBoardId) return;
    let cancelled = false;
    let latestRequest = 0;

    const poll = () => {
      const requestId = ++latestRequest;
      const requestSnapshot = useWorkspaceStore.getState().comments;
      void fetchBoardComments(remoteBoardId).then((comments) => {
        if (cancelled || requestId !== latestRequest) return;
        const currentComments = useWorkspaceStore.getState().comments;
        const merged = mergePolledComments(comments, requestSnapshot, currentComments);
        // The server is polled for freshness, but an unchanged snapshot must
        // not become a new Zustand value. Besides avoiding a needless render,
        // this prevents mounted comment/mention surfaces from refetching their
        // participant roster on every polling tick.
        if (merged.length === currentComments.length && merged.every((comment, index) => sameComment(comment, currentComments[index]))) return;
        setComments(merged);
      });
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") poll();
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [remoteBoardId, setComments]);
}

export default useWorkspaceComments;
