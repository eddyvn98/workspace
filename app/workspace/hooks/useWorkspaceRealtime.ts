"use client";
import { getKnownRevision, rememberRevision } from "./workspaceBoardApi";

import { boardMetadata } from "@/lib/workspace/boardMetadata";
import { normalizeTreeLayoutFields } from "../utils/normalizeTreeLayoutFields";
import { normalizeCameraFrames } from "../utils/cameraFrameOps";
import { skipNextWorkspaceHistorySnapshot } from "../utils/workspaceHistoryBridge";
import { useCallback, useEffect, useRef, useState } from "react";
import { connectWorkspaceBoard, type WorkspaceLiveHandle, type WorkspacePeer } from "@/lib/workspace/ydoc";
import type { PlainBoard } from "@/lib/workspace/ydoc-shapes";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useWorkspaceRemoteBoardId } from "./useWorkspaceRemoteBoardId";
import { wasBoardSelfCreated } from "../utils/selfCreatedBoards";
import {
  skipNextWorkspacePersistenceSnapshot,
  skipNextWorkspaceRealtimePublish,
  setWorkspaceRealtimeLive,
} from "../utils/workspaceRealtimeProjection";
import { registerWorkspaceRealtimeFlush } from "../utils/workspaceRealtimeFlush";
import { useWorkspaceRealtimePublisher } from "./useWorkspaceRealtimePublisher";

/**
 * Puts a board into a live session: everyone in it sees the same canvas as it
 * changes, and each other's selection, without waiting for a poll.
 *
 * Legacy oracle: app/mindmap/hooks/useMindmapRealtime.ts.
 *
 * Two things are deliberately NOT here.
 *
 * There is no fallback to build. When a live session is unavailable — the
 * secret is unset, the service is down, the token is refused — this hook does
 * nothing at all, and the board keeps saving over REST with its revision
 * check and keeps polling presence every fifteen seconds. That is the whole
 * degradation story: slower, not broken. It is why realtime could be the last
 * thing ported rather than the first.
 *
 * And presence does not get a second channel. The peers a live session
 * reports are written into the same `remoteViewers` the polling layer feeds,
 * so the presence rings light up instantly with no change to any component
 * that draws them.
 */

/** Fetches a token. Null means the person has no access, or the feature is
 *  not configured on this server — both of which mean "no live session", and
 *  neither of which is an error the user should see. */
async function mintToken(boardId: string): Promise<{ token: string; wsUrl: string } | null> {
  try {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(boardId)}/ws-token`, {
      method: "POST",
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body?.token === "string" && typeof body?.wsUrl === "string"
      ? { token: body.token, wsUrl: body.wsUrl }
      : null;
  } catch {
    return null;
  }
}

export interface WorkspaceRealtime {
  /** True once the socket is up. Until then every write goes to REST as
   *  before, so a caller does not have to wait for this. */
  live: boolean;
  /** Publishes a locally-edited board into the session. A no-op when there is
   *  no session, which is what lets callers call it unconditionally. */
  publish: (previous: PlainBoard, next: PlainBoard) => void;
  peers: WorkspacePeer[];
}

export function useWorkspaceRealtime(boardId: string, enabled = true): WorkspaceRealtime {
  const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
  // Collection records require REST CAS + per-record 3-way merge. The current
  // room protocol stores whole blocks and can lose concurrent record writes.
  const hasCollection = useWorkspaceStore((state) => Object.values(state.blocks).some((b) => b.type === "collection"));
  const [live, setLive] = useState(false);
  const [peers, setPeers] = useState<WorkspacePeer[]>([]);
  const handleRef = useRef<WorkspaceLiveHandle | null>(null);
  const unregisterFlushRef = useRef<(() => void) | null>(null);
  const flushRealtimePendingSave = useWorkspaceRealtimePublisher(boardId, remoteBoardId, handleRef);

  useEffect(() => {
    if (!enabled || !remoteBoardId || hasCollection) return;
    let cancelled = false;

    void (async () => {
      const minted = await mintToken(remoteBoardId);
      // No token, no session, no complaint: REST autosave and presence
      // polling are already carrying this board.
      if (!minted || cancelled) return;

      const initialState = useWorkspaceStore.getState();
      // Existing boards are seeded by the workspace room from its database
      // snapshot. Re-seeding them from this store is unsafe because this
      // effect used to race REST hydration and could replay an older set of
      // connector waypoints/ports over the freshly loaded board. A local seed
      // is only needed for a brand-new board whose first REST save may still
      // be completing.
      const initialBoard = wasBoardSelfCreated(remoteBoardId)
        ? {
            ...boardMetadata(initialState),
            title: initialState.title,
            blocks: initialState.blocks,
            blockOrder: initialState.blockOrder,
            connectors: initialState.connectors,
          }
        : undefined;

      const handle = connectWorkspaceBoard({
        boardId: remoteBoardId,
        token: minted.token,
        wsUrl: minted.wsUrl,
        userEmail: useWorkspaceStore.getState().currentUserEmail,
        initialBoard,
        onRevision: (revision) => {
          const current = useWorkspaceStore.getState();
          rememberRevision({ id: remoteBoardId, revision, blocks: current.blocks, blockOrder: current.blockOrder, connectors: current.connectors });
        },
        onBoard: (board) => {
          const current = useWorkspaceStore.getState();
          if (Object.values(current.blocks).some((b) => b.type === "collection")) return;
          if (board.revision !== undefined && board.revision < (getKnownRevision(remoteBoardId) ?? -1)) return;
          // A newly-connected Yjs room can briefly announce its empty
          // initial document before REST hydration has finished. Do not let
          // that transient projection erase a board that is already loaded
          // locally/from REST; the REST revision remains authoritative for
          // the initial hydrate.
          const incomingBlockCount = Object.keys(board.blocks ?? {}).length;
          if (incomingBlockCount === 0 && current.blockOrder.length > 0 && board.revision === undefined) {
            // Only an unseeded empty room is ignored; real remote deletions must render.
            return;
          }
          // The document is the source of truth while a session is live, so
          // this is the projection every other reader sees. Written with the
          // same direct setState the hydration and version-restore paths
          // already use (see useWorkspacePersistence.ts) rather than through
          // the per-block actions, which would fire one store update and one
          // autosave per block.
          //
          // The room already committed this content to the database itself
          // (see .../sync-board), so this projection must not also trigger a
          // REST autosave — useWorkspacePersistence's cached baseRevision is
          // always one step behind what the room just wrote, which otherwise
          // made every incoming remote edit refused with a 409.
          if (board.revision !== undefined) rememberRevision({ id: remoteBoardId, ...board });
          skipNextWorkspaceHistorySnapshot();
          skipNextWorkspacePersistenceSnapshot();
          // This same store write is also what this hook's own local-edit
          // subscriber below listens on. The content it is about to set came
          // straight out of the Yjs doc (the initial post-sync projection, or
          // a remote peer's change) — it is not a local edit, and the doc
          // already has it. Without this, that subscriber diffs the pre-sync
          // store snapshot against this projection, finds a JSON-level
          // difference (key order, default fields the store fills in that the
          // doc snapshot omits) even when the board is byte-for-byte
          // unchanged, and republishes it as a "local" edit. That arms
          // persistAwaiter for an ack that a no-op Yjs diff never produces, so
          // awaitPersisted() times out on every later call — including the
          // preflight before an AI turn — for a board nobody actually edited.
          skipNextWorkspaceRealtimePublish();
          useWorkspaceStore.setState({
            title: board.title,
            ...(board.frames !== undefined ? { frames: normalizeCameraFrames(board.frames) } : {}),
            ...(board.treeLayoutFamily !== undefined ? normalizeTreeLayoutFields(board) : {}),
            blocks: board.blocks as never,
            connectors: board.connectors as never,
            blockOrder: board.blockOrder,
          });
        },
        onPeers: (list) => {
          if (cancelled) return;
          setPeers(list);
          // The same field the 15s poll writes, so presence rings light up
          // instantly and nothing that draws them had to change.
          useWorkspaceStore.getState().setRemoteViewers(
            list.map((peer) => ({
              email: peer.email,
              lastSeenAt: new Date().toISOString(),
              selectedBlockId: peer.selectedBlockId,
              editingBlockId: peer.editingBlockId,
            })),
          );
        },
        // Re-minted on a timer and after every close, which is what makes a
        // session survive a network blip and what makes a revoked share take
        // effect instead of waiting for the tab to close.
        refreshToken: () => mintToken(remoteBoardId),
        // A minted token only proves this client is authorized — it says
        // nothing about whether the collab server is actually reachable. If
        // "live" were flipped as soon as connectWorkspaceBoard() returns, a
        // down/unreachable ws service would still make this hook claim the
        // room as the sole writer, which permanently disables the REST
        // autosave in useWorkspacePersistence for a room that in fact never
        // persists anything. `synced` is the provider's own signal that a
        // real sync round-trip with the server completed, and it flips back
        // to false on a genuine disconnect — so REST autosave resumes
        // covering the board exactly while the session is not truly live.
        onSyncStateChange: (synced) => {
          if (cancelled) return;
          setLive(synced);
          setWorkspaceRealtimeLive(synced ? remoteBoardId : null);
          if (synced) {
            unregisterFlushRef.current ??= registerWorkspaceRealtimeFlush(remoteBoardId, flushRealtimePendingSave);
          }
        },
      });

      if (cancelled) {
        handle.destroy();
        return;
      }
      handleRef.current = handle;
    })();

    return () => {
      cancelled = true;
      unregisterFlushRef.current?.();
      unregisterFlushRef.current = null;
      handleRef.current?.destroy();
      handleRef.current = null;
      setLive(false);
      setWorkspaceRealtimeLive(null);
      setPeers([]);
    };
  }, [enabled, hasCollection, remoteBoardId, flushRealtimePendingSave]);

  // Broadcasts what this person is looking at. Subscribed rather than polled,
  // and de-duplicated inside the handle, so a selection that did not move
  // costs nothing.
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const editingBlockId = useWorkspaceStore((state) => state.editingBlockId);
  useEffect(() => {
    handleRef.current?.setFocus(selectedBlockIds[0] ?? null, editingBlockId ?? null);
  }, [selectedBlockIds, editingBlockId]);

  const publish = useCallback((previous: PlainBoard, next: PlainBoard) => {
    handleRef.current?.publish(previous, next);
  }, []);

  return { live, publish, peers };
}

export default useWorkspaceRealtime;
