"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { boardKey, upsertIndexEntry } from "./workspaceBoardIndex";
import { saveRemoteBoard } from "./workspaceBoardApi";
import { flushWorkspacePendingSave, hasWorkspacePersistenceFlush } from "../utils/workspacePersistenceFlush";
import { boardMetadata } from "@/lib/workspace/boardMetadata";

export function useWorkspaceManualSave(boardId: string | null) {
  return useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !boardId) return false;
    const state = useWorkspaceStore.getState();
    if (state.isReadOnly) {
      toast.error("Cannot save read-only workspace");
      return false;
    }

    try {
      const snapshot = {
        blocks: state.blocks,
        blockOrder: state.blockOrder,
        connectors: state.connectors,
        camera: state.camera,
        ...boardMetadata(state),
        title: state.title,
        savedAt: Date.now(),
      };
      let cached = false;
      try {
        window.localStorage.setItem(boardKey(boardId), JSON.stringify(snapshot));
        cached = true;
        upsertIndexEntry({ id: boardId, title: state.title, updatedAt: snapshot.savedAt });
      } catch { /* A full device cache must not prevent a server save. */ }

      // Use the existing writer to avoid racing a pending autosave or realtime flush.
      if (hasWorkspacePersistenceFlush(boardId)) {
        if (!await flushWorkspacePendingSave(boardId, true)) {
          toast.error(cached ? "Saved on this device. The server has not confirmed the save; retry when connected." : "The server has not confirmed the save; retry when connected.");
          return false;
        }
        if (useWorkspaceStore.getState().boardId !== boardId) return true;
        toast.success("Workspace saved successfully");
        return true;
      }

      const { savedAt: _savedAt, ...content } = snapshot;
      const result = await saveRemoteBoard(boardId, content);
      if (useWorkspaceStore.getState().boardId !== boardId) return result.ok;

      if (result.ok) {
        toast.success("Workspace saved successfully");
        return true;
      } else {
        toast.error(result.error || "Failed to save workspace to server");
        return false;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save workspace");
      return false;
    }
  }, [boardId]);
}

export default useWorkspaceManualSave;
