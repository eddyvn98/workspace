"use client";

import { useCallback, useRef, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { checkBoardAccess, getKnownContent, saveRemoteBoard } from "./workspaceBoardApi";
import { mergeBoardContent } from "../utils/mergeBoardConflict";
import { notifyMergeConflicts } from "../utils/restoreMergeConflicts";
import { boardKey, upsertIndexEntry, type BoardSnapshot } from "./workspaceBoardIndex";
import { consumeWorkspaceMutation } from "../utils/workspaceMutationIntent";
import { isWorkspaceRealtimeLive } from "../utils/workspaceRealtimeProjection";
import { announceWorkspaceBoardPersisted } from "./useWorkspaceRemoteBoardId";
import { normalizeCameraFrames } from "../utils/cameraFrameOps";
import { normalizeTreeLayoutFields } from "../utils/normalizeTreeLayoutFields";
import type { AdoptPayload } from "./workspacePersistenceTypes";

export function useWorkspacePersistenceSave(
  boardId: string,
  remoteLoadSettledRef: { current: boolean },
  adopt: (parsed: AdoptPayload, targetBoardId: string) => void,
) {
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSaveInFlightRef = useRef(false);
  const hasPendingSaveRef = useRef(false);
  const saveInFlightPromiseRef = useRef<Promise<void> | null>(null);
  const lastSaveOkRef = useRef(true);
  const [isSavePending, setIsSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useCallback(() => {
    if (typeof window === "undefined" || !remoteLoadSettledRef.current) return;
    const id = boardIdRef.current;
    if (!id) {
      setIsSavePending(false);
      return;
    }
    const state = useWorkspaceStore.getState();
    if (state.isReadOnly) {
      setIsSavePending(false);
      return;
    }
    const snapshot: BoardSnapshot = {
      blocks: state.blocks,
      blockOrder: state.blockOrder,
      connectors: state.connectors,
      camera: state.camera,
      frames: state.frames,
      title: state.title,
      treeLayoutDirection: state.treeLayoutDirection,
      treeGrowthMode: state.treeGrowthMode,
      treeLayoutFamily: state.treeLayoutFamily,
      treeTimelineBranchMode: state.treeTimelineBranchMode,
      treeTimelineDescendantStyle: state.treeTimelineDescendantStyle,
      treeCatalogDescendantStyle: state.treeCatalogDescendantStyle,
      savedAt: Date.now(),
    };
    try {
      window.localStorage.setItem(boardKey(id), JSON.stringify(snapshot));
      upsertIndexEntry({ id, title: state.title, updatedAt: snapshot.savedAt ?? Date.now() });
    } catch {
      // Ignore localStorage quota errors.
    }
    announceWorkspaceBoardPersisted(id);
    if (isWorkspaceRealtimeLive(id)) {
      setIsSavePending(false);
      return;
    }
    if (isSaveInFlightRef.current) {
      hasPendingSaveRef.current = true;
      return;
    }
    isSaveInFlightRef.current = true;
    setSaveError(null);
    const editOperation = consumeWorkspaceMutation();
    const executeRemoteSave = async () => {
      try {
        const result = await saveRemoteBoard(id, {
          title: state.title,
          blocks: state.blocks,
          blockOrder: state.blockOrder,
          connectors: state.connectors,
          camera: state.camera,
          frames: state.frames,
          treeLayoutDirection: state.treeLayoutDirection,
          treeGrowthMode: state.treeGrowthMode,
          treeLayoutFamily: state.treeLayoutFamily,
          treeTimelineBranchMode: state.treeTimelineBranchMode,
          treeTimelineDescendantStyle: state.treeTimelineDescendantStyle,
          treeCatalogDescendantStyle: state.treeCatalogDescendantStyle,
          ...(editOperation ? { editOperation } : {}),
        });
        lastSaveOkRef.current = result.ok;
        if (!result.ok) {
          // Taken before checkBoardAccess below replaces it with the server's.
          const base = result.conflict ? getKnownContent(id) : undefined;
          const authoritative = await checkBoardAccess(id);
          if (authoritative.status === "ok" && base) {
            // Another writer moved the board on: fold this tab's edits into
            // the server's version instead of throwing them away, then save
            // the merged result against the new revision.
            const mine = useWorkspaceStore.getState();
            const merged = mergeBoardContent(
              base,
              { blocks: mine.blocks as never, blockOrder: mine.blockOrder, connectors: mine.connectors as never },
              {
                blocks: authoritative.board.blocks as never,
                blockOrder: authoritative.board.blockOrder as never,
                connectors: authoritative.board.connectors as never,
              },
            );
            ignoreNextStoreChangeRef.current = true;
            adopt({ ...authoritative.board, blocks: merged.blocks, blockOrder: merged.blockOrder, connectors: merged.connectors } as never, id);
            lastSaveOkRef.current = merged.conflicts === 0;
            setSaveError(merged.conflicts === 0 ? null : "Some of your changes conflicted with another editor's and were not applied.");
            notifyMergeConflicts(merged.items);
            hasPendingSaveRef.current = true;
          } else if (authoritative.status === "ok") {
            const current = useWorkspaceStore.getState();
            const matchesAuthoritative = JSON.stringify(current.blocks) === JSON.stringify(authoritative.board.blocks)
              && JSON.stringify(current.blockOrder) === JSON.stringify(authoritative.board.blockOrder)
              && JSON.stringify(current.connectors) === JSON.stringify(authoritative.board.connectors);
            setSaveError(matchesAuthoritative ? null : result.error ?? "Failed to save workspace");
            lastSaveOkRef.current = matchesAuthoritative;
            ignoreNextStoreChangeRef.current = true;
            adopt(authoritative.board, id);
            try {
              window.localStorage.setItem(boardKey(id), JSON.stringify({
                blocks: authoritative.board.blocks,
                blockOrder: authoritative.board.blockOrder,
                connectors: authoritative.board.connectors,
                camera: authoritative.board.camera,
                frames: normalizeCameraFrames(authoritative.board.frames),
                title: authoritative.board.title,
                ...normalizeTreeLayoutFields(authoritative.board),
                savedAt: new Date(authoritative.board.updatedAt).getTime() || Date.now(),
              }));
            } catch {}
          } else setSaveError(result.error ?? "Failed to save workspace");
        }
      } finally {
        isSaveInFlightRef.current = false;
        if (hasPendingSaveRef.current) {
          hasPendingSaveRef.current = false;
          save();
        } else if (debounceRef.current === null) setIsSavePending(false);
      }
    };
    saveInFlightPromiseRef.current = executeRemoteSave();
  }, [adopt, remoteLoadSettledRef]);

  const flushPendingSave = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return true;
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      save();
    }
    while (isSaveInFlightRef.current || hasPendingSaveRef.current) {
      await (saveInFlightPromiseRef.current ?? Promise.resolve());
    }
    return lastSaveOkRef.current;
  }, [save]);

  const ignoreNextStoreChangeRef = useRef(false);
  return {
    save,
    flushPendingSave,
    debounceRef,
    ignoreNextStoreChangeRef,
    isSavePending,
    setIsSavePending,
    saveError,
    setSaveError,
  };
}
