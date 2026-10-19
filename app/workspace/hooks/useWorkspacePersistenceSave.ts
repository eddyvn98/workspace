"use client";
import { hasSpreadsheetBlock } from "@/lib/workspace/spreadsheetGuard";

import { useCallback, useRef, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { checkBoardAccess, getKnownContent, saveRemoteBoard, rememberRevision } from "./workspaceBoardApi";
import { mergeBoardContent } from "../utils/mergeBoardConflict";
import { notifyMergeConflicts } from "../utils/restoreMergeConflicts";
import { boardKey, upsertIndexEntry, type BoardSnapshot } from "./workspaceBoardIndex";
import { consumeWorkspaceMutation } from "../utils/workspaceMutationIntent";
import { isWorkspaceRealtimeLive } from "../utils/workspaceRealtimeProjection";
import { announceWorkspaceBoardPersisted } from "./useWorkspaceRemoteBoardId";
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
        // A board switch while the request was in flight must not overwrite
        // the newly opened board with this response or its conflict state.
        if (boardIdRef.current !== id) return;
        lastSaveOkRef.current = result.ok;
        if (!result.ok) {
          // Network errors and 5xx are not revision conflicts. A healthy GET
          // after a failed PUT does NOT prove this draft was saved; replacing
          // it with the server copy would silently delete the user's edits.
          if (!result.conflict) {
            setSaveError(result.error ?? "Failed to save workspace; changes remain on this device");
            return;
          }
          // Taken before checkBoardAccess below replaces it with the server's.
          const base = getKnownContent(id);
          const authoritative = await checkBoardAccess(id, { remember: false });
          if (boardIdRef.current !== id) return;
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
            if (merged.conflicts && hasSpreadsheetBlock(mine.blocks)) {
              // Do not replace a workbook with the server winner and then
              // report the automatic retry as a successful save. Keep the
              // draft and the old CAS base until the user resolves it.
              hasPendingSaveRef.current = false;
              setSaveError("Spreadsheet conflict: your draft is kept on this device. Export a Native backup before reloading the server version.");
              return;
            }
            rememberRevision(authoritative.board);
            ignoreNextStoreChangeRef.current = true;
            adopt({ ...authoritative.board, blocks: merged.blocks, blockOrder: merged.blockOrder, connectors: merged.connectors } as never, id);
            lastSaveOkRef.current = merged.conflicts === 0;
            setSaveError(merged.conflicts === 0 ? null : "Some of your changes conflicted with another editor's and were not applied.");
            notifyMergeConflicts(merged.items);
            hasPendingSaveRef.current = true;
          } else {
            // Without a known common ancestor or a successful server read
            // there is no safe automatic merge. Keep the draft and let the
            // user retry after connectivity is restored.
            setSaveError("This board changed on the server; local edits were kept, but a safe merge is unavailable");
          }
        }
      } catch (error) {
        // Unexpected failures must never leave the save queue wedged or
        // masquerade as persisted state during an AI preflight flush.
        if (boardIdRef.current === id) {
          lastSaveOkRef.current = false;
          setSaveError(error instanceof Error ? error.message : "Failed to save workspace");
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
    // An edit may schedule another debounce *while* a preceding request is
    // in flight. Re-check the timer after every await so AI never reads a
    // "successfully flushed" board that still has local queued changes.
    for (;;) {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        save();
      }
      if (!isSaveInFlightRef.current && !hasPendingSaveRef.current) {
        return lastSaveOkRef.current;
      }
      await (saveInFlightPromiseRef.current ?? Promise.resolve());
    }
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
