"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { DEFAULT_CAMERA } from "../types/camera";
import { checkBoardAccess } from "./workspaceBoardApi";
import { wasBoardSelfCreated } from "../utils/selfCreatedBoards";
import {
  boardKey,
  migrateLegacyDraft,
  upsertIndexEntry,
  type BoardSnapshot,
} from "./workspaceBoardIndex";
import { normalizeTreeLayoutFields } from "../utils/normalizeTreeLayoutFields";
import { skipNextWorkspaceHistorySnapshot } from "../utils/workspaceHistoryBridge";
import {
  consumeSkippedWorkspacePersistenceSnapshot,
  isWorkspaceRealtimeLive,
  skipNextWorkspaceRealtimePublish,
} from "../utils/workspaceRealtimeProjection";
import { registerWorkspacePersistenceFlush } from "../utils/workspacePersistenceFlush";
import { hasNonDefaultWorkspaceCamera } from "./workspaceCameraState";
import { normalizeCameraFrames } from "../utils/cameraFrameOps";
import { normalizeWorkspaceContentBlocks } from "../utils/normalizeWorkspaceContentBlocks";
import type { AdoptPayload, WorkspacePersistenceApi } from "./workspacePersistenceTypes";
import { normalizeLegacySwimlaneConnectors } from "./workspaceSwimlaneNormalization";
import { useWorkspacePersistenceSave } from "./useWorkspacePersistenceSave";
export type { WorkspacePersistenceApi } from "./workspacePersistenceTypes";
export { normalizeLegacySwimlaneConnectors } from "./workspaceSwimlaneNormalization";
const AUTOSAVE_DEBOUNCE_MS = 1500;

export type { BoardIndexEntry } from "./workspaceBoardIndex";
export { createWorkspaceBoardEntry, listWorkspaceBoards, deleteWorkspaceBoard, renameWorkspaceBoard } from "./workspaceBoardIndex";

/**
 * Persistence engine for Workspace — synchronizes canvas state across
 * local cache and backend database with debounce, concurrency queue,
 * reload authority, and page unload flushing.
 */
export function useWorkspacePersistence(boardId: string): WorkspacePersistenceApi {
  const isHydratedRef = useRef(false);
  const remoteLoadSettledRef = useRef(false);
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;
  const hasEditedSinceMountRef = useRef(false);

  const [loadError, setLoadError] = useState(false);
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [readyBoardId, setReadyBoardId] = useState<string | null>(null);
  const [hasSavedCamera, setHasSavedCamera] = useState(false);
  const adopt = useCallback((parsed: AdoptPayload, targetBoardId: string) => {
    skipNextWorkspaceHistorySnapshot();
    // Every adopt() call is a hydration/reconciliation replay (initial local
    // snapshot, REST load, or an authoritative rollback), never a genuine
    // edit — it must not be republished into a live realtime room. See
    // skipNextWorkspaceRealtimePublish for why an unguarded republish can
    // permanently break the flush-before-AI-read preflight.
    skipNextWorkspaceRealtimePublish();
    const rawBlocks = (parsed.blocks as ReturnType<typeof useWorkspaceStore.getState>["blocks"]) ?? {};
    const normalized = normalizeWorkspaceContentBlocks(
      rawBlocks,
      (parsed.connectors as ReturnType<typeof useWorkspaceStore.getState>["connectors"]) ?? {},
    );
    const blocks = normalized.blocks;
    const connectors = normalizeLegacySwimlaneConnectors(blocks, normalized.connectors);
    useWorkspaceStore.setState({
      blocks,
      blockOrder: (parsed.blockOrder as string[]) ?? [],
      connectors: connectors as unknown as ReturnType<typeof useWorkspaceStore.getState>["connectors"],
      camera: (parsed.camera as typeof DEFAULT_CAMERA) ?? DEFAULT_CAMERA,
      frames: normalizeCameraFrames(parsed.frames),
      title: typeof parsed.title === "string" && parsed.title !== "Untitled Workspace"
        ? parsed.title
        : "New Mindmap",
      ...normalizeTreeLayoutFields(parsed),
      boardId: targetBoardId,
    });
  }, []);
  const {
    save,
    flushPendingSave,
    debounceRef,
    ignoreNextStoreChangeRef,
    isSavePending,
    setIsSavePending,
    saveError,
    setSaveError,
  } = useWorkspacePersistenceSave(boardId, remoteLoadSettledRef, adopt);
  useEffect(() => {
    if (!boardId) return;
    return registerWorkspacePersistenceFlush(boardId, flushPendingSave, () => { setIsSavePending(true); save(); });
  }, [boardId, flushPendingSave, save, setIsSavePending]);
  useEffect(() => {
    if (!boardId) {
      setIsLoadingBoard(false);
      setReadyBoardId(null);
      return;
    }
    isHydratedRef.current = false;
    remoteLoadSettledRef.current = false;
    setReadyBoardId(null);
    hasEditedSinceMountRef.current = false;
    setIsLoadingBoard(true);
    setLoadError(false);
    setSaveError(null);
    setHasSavedCamera(false);
    let cancelled = false;
    migrateLegacyDraft();
    let localSnapshot: BoardSnapshot | null = null;
    try {
      const raw = window.localStorage.getItem(boardKey(boardId));
      if (raw) {
        localSnapshot = JSON.parse(raw) as BoardSnapshot;
        setHasSavedCamera(localSnapshot.camera !== undefined);
        adopt(localSnapshot, boardId);
      } else {
        adopt({}, boardId);
      }
    } catch {
      adopt({}, boardId);
    }
    void checkBoardAccess(boardId).then((result) => {
      if (cancelled || boardIdRef.current !== boardId) return;

      if (result.status === "ok") {
        const remoteBoard = result.board;
        const remoteUpdatedAt = new Date(remoteBoard.updatedAt).getTime();

        // A user edit made while this fetch was in flight (e.g. switching Map
        // Layout right after opening the board) always outranks whatever the
        // fetch resolves with — the timestamp comparison alone isn't enough
        // because the GET below can still return data snapshotted before that
        // edit's own save request reaches the server.
        // Once the authoritative request has returned, a cache written by a
        // failed/optimistic save must never outrank the server merely because
        // its local timestamp is newer. Only edits made after this mount may
        // remain ahead of the response while their save is in flight.
        if (!hasEditedSinceMountRef.current) {
          if (!localSnapshot || localSnapshot.camera === undefined) {
            setHasSavedCamera(hasNonDefaultWorkspaceCamera(remoteBoard.camera));
          }
          adopt(remoteBoard, boardId);
          try {
            const serverSnapshot: BoardSnapshot = {
              blocks: remoteBoard.blocks,
              blockOrder: remoteBoard.blockOrder,
              connectors: remoteBoard.connectors,
              camera: remoteBoard.camera,
              frames: normalizeCameraFrames(remoteBoard.frames),
              title: remoteBoard.title,
              treeLayoutDirection: remoteBoard.treeLayoutDirection,
              treeGrowthMode: remoteBoard.treeGrowthMode,
              treeLayoutFamily: remoteBoard.treeLayoutFamily,
              treeTimelineBranchMode: remoteBoard.treeTimelineBranchMode,
              treeTimelineDescendantStyle: remoteBoard.treeTimelineDescendantStyle,
              treeCatalogDescendantStyle: remoteBoard.treeCatalogDescendantStyle,
              savedAt: remoteUpdatedAt || Date.now(),
            };
            window.localStorage.setItem(boardKey(boardId), JSON.stringify(serverSnapshot));
            upsertIndexEntry({ id: boardId, title: remoteBoard.title, updatedAt: serverSnapshot.savedAt ?? Date.now() });
          } catch {}
        }
        setLoadError(false);
        isHydratedRef.current = true;
        remoteLoadSettledRef.current = true;
        setReadyBoardId(boardId);
      } else if (result.status === "not_found_or_denied") {
        if (wasBoardSelfCreated(boardId)) {
          setLoadError(false);
          isHydratedRef.current = true;
          remoteLoadSettledRef.current = true;
          setReadyBoardId(boardId);
          // A brand-new board only exists in localStorage until its first
          // edit. The AI reads boards over REST, so create the row now;
          // otherwise the first chat turn targets a board the server cannot
          // find and the agent reports it cannot access the workspace.
          save();
        } else {
          // The server has no such board and this browser never marked it as
          // awaiting its first save, so it was deleted or access was revoked.
          // Opening the stale local copy would look editable while nothing
          // could ever be saved or read by the AI.
          setLoadError(true);
        }
      } else {
        // Network or server error: fail soft to local cache if present
        if (!localSnapshot && !wasBoardSelfCreated(boardId)) {
          setLoadError(true);
        }
      }
    }).finally(() => {
      if (!cancelled) setIsLoadingBoard(false);
    });
    const unsubscribe = useWorkspaceStore.subscribe((state, previousState) => {
      // Consumed unconditionally so the flag never leaks into a later,
      // genuine edit if this particular update turns out to be a no-op below.
      const isRealtimeProjection = consumeSkippedWorkspacePersistenceSnapshot();
      if (ignoreNextStoreChangeRef.current) {
        ignoreNextStoreChangeRef.current = false;
        return;
      }
      if (isRealtimeProjection) return;
      // The live room is the writer while realtime is connected. Scheduling a
      // REST autosave for every drag frame only creates timers and React
      // updates; save() will reject it anyway because the room owns the
      // revision. Keep REST persistence for offline/non-live boards.
      if (isWorkspaceRealtimeLive(boardIdRef.current)) return;
      if (!isHydratedRef.current) return;
      if (!remoteLoadSettledRef.current) return;
      if (state.isReadOnly) return;
      if (state.boardId !== boardIdRef.current) return;
      const persistedStateChanged = state.blocks !== previousState.blocks
        || state.blockOrder !== previousState.blockOrder
        || state.connectors !== previousState.connectors
        || state.camera !== previousState.camera
        || state.frames !== previousState.frames
        || state.title !== previousState.title
        || state.treeLayoutDirection !== previousState.treeLayoutDirection
        || state.treeGrowthMode !== previousState.treeGrowthMode
        || state.treeLayoutFamily !== previousState.treeLayoutFamily
        || state.treeTimelineBranchMode !== previousState.treeTimelineBranchMode
        || state.treeTimelineDescendantStyle !== previousState.treeTimelineDescendantStyle
        || state.treeCatalogDescendantStyle !== previousState.treeCatalogDescendantStyle;
      if (!persistedStateChanged) return;

      hasEditedSinceMountRef.current = true;
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      setIsSavePending(true);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        save();
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    const flushPendingSync = () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        save();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPendingSync();
    };
    window.addEventListener("pagehide", flushPendingSync);
    window.addEventListener("beforeunload", flushPendingSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("pagehide", flushPendingSync);
      window.removeEventListener("beforeunload", flushPendingSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [boardId, adopt, save, debounceRef, ignoreNextStoreChangeRef, setIsSavePending, setSaveError]);

  return {
    save,
    flushPendingSave,
    isSavePending,
    saveError,
    loadError,
    isLoadingBoard,
    isBoardReady: readyBoardId === boardId,
    hasSavedCamera,
  };
}
export default useWorkspacePersistence;
