"use client";

import { normalizeTreeLayoutFields } from "../utils/normalizeTreeLayoutFields";
import { normalizeCameraFrames } from "../utils/cameraFrameOps";
import { useEffect, useRef } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useWorkspaceRemoteBoardId } from "./useWorkspaceRemoteBoardId";
import { checkBoardAccess, getKnownRevision, rememberRevision } from "./workspaceBoardApi";
import { skipNextWorkspaceHistorySnapshot } from "../utils/workspaceHistoryBridge";
import { skipNextWorkspacePersistenceSnapshot, skipNextWorkspaceRealtimePublish } from "../utils/workspaceRealtimeProjection";

/**
 * Picks up a board mutation that landed straight in Postgres from OUTSIDE
 * this tab's own save/realtime path — specifically the Dify Workspace Agent
 * calling POST /api/workspaces/[id]/agent, which writes via
 * commitBoardContent() directly.
 *
 * FALLBACK only, not the primary sync path. The primary path is
 * server-side and event-driven: the agent route pushes the exact ids it
 * touched straight into any already-open live room right after committing
 * (see lib/workspace/ws-repository-notify.ts and
 * docker/mindmap-ws/src/workspace-room-refresh.js), which is what actually
 * makes an external mutation appear on an open canvas without a poll delay.
 * This hook exists for what that push cannot reach:
 *   - this board has no live room at all (realtime unset/down/refused —
 *     useWorkspaceRealtime.ts's live stays false, and REST + this poll are
 *     the whole story for that tab);
 *   - the push itself was dropped (network blip, timeout) and nobody typed
 *     again afterward to trigger the room's own next flush/catch-up.
 * Without this fallback either of those leaves a tab caught up only on a
 * manual reload.
 *
 * Same shape as useWorkspacePresence's heartbeat: poll on an interval while
 * the tab is visible, do nothing otherwise. It only ever pulls (GET, same
 * revision-compare pattern useWorkspacePersistence's initial load already
 * uses), and it stands down the moment there is a live realtime session
 * (which already owns board state at that point — see the primary path
 * above) or a local edit has not yet been saved (pulling remote content over
 * an in-flight local edit is exactly the silent-overwrite bug the revision
 * check elsewhere in this engine exists to prevent).
 */
const EXTERNAL_SYNC_INTERVAL_MS = 10_000;

export interface WorkspaceExternalSyncOptions {
  /** Skip polling while a live realtime session owns this board — see the
   *  module doc above for why an external REST write and a live Yjs room
   *  don't need to be reconciled here. */
  live: boolean;
  /** Skip polling while a local edit is unsaved — a pulled remote snapshot
   *  must never race a debounced/in-flight autosave. */
  hasUnsavedLocalChanges: boolean;
}

export function useWorkspaceExternalSync(
  boardId: string,
  { live, hasUnsavedLocalChanges }: WorkspaceExternalSyncOptions,
): void {
  const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
  const liveRef = useRef(live);
  liveRef.current = live;
  const unsavedRef = useRef(hasUnsavedLocalChanges);
  unsavedRef.current = hasUnsavedLocalChanges;
  const knownRevisionRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!remoteBoardId) return;
    let cancelled = false;
    // Reset on every boardId change (including remount) so a switch between
    // boards always re-learns the revision instead of comparing against a
    // stale one from whatever board was open before.
    knownRevisionRef.current = getKnownRevision(remoteBoardId);

    const tick = async () => {
      if (cancelled || liveRef.current || unsavedRef.current) return;
      const before = useWorkspaceStore.getState();
      // A speculative poll must not advance the CAS base before adoption.
      const result = await checkBoardAccess(remoteBoardId, { remember: false });
      if (cancelled || liveRef.current || unsavedRef.current || result.status !== "ok") return;
      const remoteRevision = result.board.revision;
      if (typeof remoteRevision !== "number") return;
      const state = useWorkspaceStore.getState();
      if (state.boardId !== remoteBoardId || state.blocks !== before.blocks || state.connectors !== before.connectors
        || state.blockOrder !== before.blockOrder || remoteRevision < (getKnownRevision(remoteBoardId) ?? -1)) return;

      const known = knownRevisionRef.current;
      knownRevisionRef.current = Math.max(known ?? -1, remoteRevision);
      // First tick after (re)mount just learns the current revision; nothing
      // to reconcile against yet.
      if (known === undefined || remoteRevision <= known) return;

      // What was just pulled came from the server: it must not become an undo
      // step, be saved straight back, or be re-published to a live room.
      rememberRevision(result.board);
      skipNextWorkspaceHistorySnapshot();
      skipNextWorkspacePersistenceSnapshot();
      skipNextWorkspaceRealtimePublish();
      useWorkspaceStore.setState({
        frames: normalizeCameraFrames(result.board.frames),
        ...normalizeTreeLayoutFields(result.board),
        blocks: result.board.blocks as never,
        blockOrder: result.board.blockOrder as never,
        connectors: result.board.connectors as never,
      });
    };

    void tick();
    const interval = setInterval(() => void tick(), EXTERNAL_SYNC_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [remoteBoardId]);
}

export default useWorkspaceExternalSync;
