/**
 * Opens a live session on one board: the socket, the shared document, and
 * presence.
 *
 * Legacy oracle: lib/mindmap/ydoc.ts. One deliberate difference — that module
 * writes straight into the mindmap store, so the data layer imports the UI's
 * state. This one reports through callbacks and knows nothing about a store,
 * which keeps the dependency pointing one way and lets the same helper be
 * driven by a test with no React at all.
 *
 * Everything else here is carried over, including the parts that only exist
 * because they were learned the hard way. See the token comments below: the
 * naive version of this connects once, works for forty seconds, and then
 * dies silently on the first network blip.
 */

import * as Y from "yjs";
import { createPersistenceAwaiter } from "./ydoc-persistence";
export { createPersistenceAwaiter } from "./ydoc-persistence";
import { createWorkspaceBoardProjection } from "./ydoc-projection";
import { WebsocketProvider } from "y-websocket";
import { applyBoardDiffToDoc, deriveBoardFromDoc, workspaceDocMaps, type PlainBoard } from "./ydoc-shapes";
import { documentFragments, DOCUMENT_PROTOCOL_VERSION } from "./ydoc-documents";
import { browserDocumentCodec } from "./document-codec-browser";
import { setDocumentSession, refreshDocumentSession } from "./document-session";

/** What this client broadcasts about itself, and reads back for every peer. */
export interface WorkspacePeer {
  email: string;
  clientId: number;
  selectedBlockId: string | null;
  editingBlockId: string | null;
}

export interface WorkspaceLiveHandle {
  doc: Y.Doc;
  /** Pushes a locally-edited board into the shared document. Diffed, so a
   *  one-character rename does not broadcast the whole board. */
  publish: (previous: PlainBoard, next: PlainBoard) => void;
  /** Tells everyone else what this person is looking at. */
  setFocus: (selectedBlockId: string | null, editingBlockId: string | null) => void;
  connected: () => boolean;
  hasPendingChanges: () => boolean;
  /** Stop network access while retaining the local draft and its fragment IDs. */
  disconnect: () => void;
  /** Resolves once the workspace-ws room's own idle/deadline scheduler has
   *  flushed the most recently published edit into the database — observed
   *  via the `boardRevision` meta key the ws server (docker/mindmap-ws)
   *  stamps on a successful POST .../sync-board, which reaches this doc
   *  through the same Yjs replication as any other edit, not a direct
   *  callback from the server. Resolves `true` immediately if nothing has
   *  been published since the last confirmation. Resolves `false` after
   *  `timeoutMs` if the server has not confirmed yet; a caller may still
   *  choose to proceed — this is a best-effort wait, not a guarantee, since
   *  the room can legitimately still be inside its idle window. */
  awaitPersisted: (timeoutMs?: number) => Promise<boolean>;
  destroy: () => void;
}

export interface ConnectWorkspaceOptions {
  boardId: string;
  /** Short-lived token from POST /api/workspaces/[id]/ws-token. */
  token: string;
  wsUrl: string;
  userEmail?: string | null;
  /** Legacy room seed. Protocol-v1 rooms load their repository checkpoint on the server. */
  initialBoard?: PlainBoard;
  /** Known unsaved initial content must reach REST before adopting a fresh room. */
  hasPendingInitialChanges?: boolean;
  /** Old flat-map services cannot safely accept concurrent edits inside a Document. */
  requireDocumentProtocol?: boolean;
  /** Called with the board as the document now says it is, on every local and
   *  remote change. The caller treats this as the source of truth while a
   *  session is live. */
  onBoard: (board: PlainBoard, source?: { local: boolean; crdt: boolean }) => void;
  /** The first handshake raced a local edit; reconnect only after flushing that draft. */
  onPreSyncChanges?: () => void;
  /** Persistence receipts advance revision without replaying canvas content. */
  onRevision?: (revision: number) => void;
  /** Called with everyone else in the room. Excludes this client. */
  onPeers?: (peers: WorkspacePeer[]) => void;
  /** Fires whenever the socket's actual sync state with the room flips.
   *  `connectWorkspaceBoard` returning, or even the socket reaching
   *  `wsconnected`, is not enough to call the room "live" — a minted token
   *  only proves this client is authorized, not that the collab server is
   *  reachable. `true` here is the only signal that the doc has actually
   *  exchanged sync step 2 with the server and is safe to treat as the sole
   *  writer; `false` (the initial state, and what the provider sets on any
   *  disconnect) means content changes must keep flowing through REST. */
  onSyncStateChange?: (synced: boolean) => void;
  /**
   * Mints a replacement token, or returns null when access is gone. Needed
   * for two different reasons:
   *
   *  - A token lives 60 seconds and a session lasts hours, so the token the
   *    socket opened with is stale almost immediately. Without a fresh one, a
   *    reconnect after any blip is refused and the person sits on a canvas
   *    that looks fine and is no longer connected to anybody.
   *  - An access change closes the socket deliberately (4403). A new token
   *    reconnects under the new role — which is what a downgrade to viewer
   *    looks like from here — while null means access is gone and the
   *    connection stays closed.
   */
  refreshToken?: () => Promise<{ token: string } | null>;
}

/** Comfortably inside the 60s token lifetime, so a reconnect at any moment
 *  finds a valid one. */
const TOKEN_REFRESH_INTERVAL_MS = 40_000;

/** Rooms are namespaced by kind so one service can host both engines: a
 *  workspace board and a mindmap that happen to share an id are different
 *  rooms, not the same room with mixed content. */
export const workspaceRoomName = (boardId: string) => `workspace/${boardId}`;

export function connectWorkspaceBoard(options: ConnectWorkspaceOptions): WorkspaceLiveHandle {
  const { boardId, token, wsUrl, userEmail, onBoard, onPeers } = options;

  const doc = new Y.Doc();
  // Read through the provider's url getter on every reconnect, so replacing
  // the value here is what lets a reconnect carry a newly minted token.
  const params: { token: string } = { token };
  const provider = new WebsocketProvider(wsUrl, workspaceRoomName(boardId), doc, { params });

  let destroyed = false;
  let tokenTimer: ReturnType<typeof setInterval> | null = null;

  if (options.refreshToken) {
    const refresh = options.refreshToken;
    let inFlight: Promise<{ token: string } | null> | null = null;
    let reconnectPending = false;
    const freshToken = () => {
      if (!inFlight) {
        inFlight = refresh().catch(() => null).finally(() => { inFlight = null; });
      }
      return inFlight;
    };
    const acceptToken = (next: { token: string } | null) => {
      if (!next || destroyed) return;
      params.token = next.token;
      // A failed refresh after close must recover on the next successful
      // timer refresh, even though the provider's own retry is paused.
      if (reconnectPending) { reconnectPending = false; provider.connect(); }
    };

    tokenTimer = setInterval(() => {
      void freshToken().then(acceptToken);
    }, TOKEN_REFRESH_INTERVAL_MS);

    // y-websocket schedules its retry immediately after this event fires.
    // The retry has to be paused while a fresh token is minted, or a dropped
    // socket keeps replaying the expired one and never reaches a valid sync.
    provider.on("connection-close", () => {
      if (destroyed || !provider.shouldConnect) return;
      provider.shouldConnect = false;
      reconnectPending = true;
      void freshToken().then(acceptToken);
    });
  }

  const { blocks, connectors, meta } = workspaceDocMaps(doc);
  const fragments = documentFragments(doc);
  let hasSynced = false;
  let rejectedFirstSync = false;
  let pendingBeforeSync = Boolean(options.hasPendingInitialChanges);
  let projectionSource = { local: false, crdt: false };
  const projectBoard = createWorkspaceBoardProjection(doc, board => onBoard(board, projectionSource), options.onRevision, browserDocumentCodec);
  const pushBoard = (events?: unknown[], transaction?: Y.Transaction) => {
    if (!hasSynced || rejectedFirstSync) return;
    projectionSource = { local: Boolean(transaction?.local), crdt: meta.get("docProtocolVersion") === DOCUMENT_PROTOCOL_VERSION };
    projectBoard(events, transaction);
  };
  // observeDeep, not observe: a change to a block's own contents has to reach
  // the projection too, not only adding and removing whole blocks.
  blocks.observeDeep(pushBoard);
  connectors.observeDeep(pushBoard);
  meta.observeDeep(pushBoard);
  fragments.observeDeep(pushBoard);
  fragments.observe(refreshDocumentSession);
  // A first sync must not replay stale HTML over live peer edits. Local edits
  // during this handshake stay in the store/REST path; discard this document
  // and start a fresh handshake after the caller has flushed those changes.
  const onSync = (synced: boolean) => {
    if (destroyed || rejectedFirstSync) return;
    if (!synced) { options.onSyncStateChange?.(false); return; }
    if (!hasSynced) {
      const supportsDocuments = meta.get("docProtocolVersion") === DOCUMENT_PROTOCOL_VERSION;
      if ((options.requireDocumentProtocol && !supportsDocuments) || pendingBeforeSync) {
        rejectedFirstSync = true;
        provider.disconnect();
        options.onSyncStateChange?.(false);
        if (pendingBeforeSync) options.onPreSyncChanges?.();
        return;
      }
      hasSynced = true;
      if (!supportsDocuments && options.initialBoard) {
        applyBoardDiffToDoc(doc, deriveBoardFromDoc(doc), options.initialBoard, "initial-rest-snapshot");
      }
      if (supportsDocuments) setDocumentSession(boardId, doc);
      pushBoard();
    }
    options.onSyncStateChange?.(true);
  };
  provider.on("sync", onSync);

  const awareness = provider.awareness;
  let local: WorkspacePeer | null = null;
  if (userEmail) {
    local = { email: userEmail, clientId: doc.clientID, selectedBlockId: null, editingBlockId: null };
    awareness.setLocalState(local);
  }

  const pushPeers = () => {
    if (!onPeers) return;
    const peers: WorkspacePeer[] = [];
    for (const [clientId, state] of awareness.getStates()) {
      if (clientId === doc.clientID) continue;
      const peer = state as Partial<WorkspacePeer> | null;
      if (!peer?.email) continue;
      peers.push({
        email: peer.email,
        clientId,
        selectedBlockId: peer.selectedBlockId ?? null,
        editingBlockId: peer.editingBlockId ?? null,
      });
    }
    onPeers(peers);
  };
  awareness.on("change", pushPeers);
  pushPeers();

  const persistAwaiter = createPersistenceAwaiter(meta, doc);
  const onDocumentTransaction = (transaction: Y.Transaction) => {
    if (hasSynced && transaction.local && [...transaction.changedParentTypes.keys()].some(type => Object.is(type, fragments))
      && transaction.origin !== "seed") persistAwaiter.markPending();
  };
  doc.on("afterTransaction", onDocumentTransaction);

  return {
    doc,
    publish: (previous, next) => {
      if (destroyed) return;
      if (!hasSynced) {
        if (JSON.stringify(previous) !== JSON.stringify(next)) pendingBeforeSync = true;
        return;
      }
      // Gated on applyBoardDiffToDoc's own report of whether it wrote
      // anything, not a separate whole-board comparison here: a JSON/
      // reference diff of `previous`/`next` can disagree with its per-key
      // `sameValue` checks (key order, or a field rebuilt into an
      // equal-but-not-identical value upstream) and arm a wait for an ack
      // that a no-op write never produces, permanently failing every later
      // awaitPersisted() call for a board nobody actually edited.
      const codec = meta.get("docProtocolVersion") === DOCUMENT_PROTOCOL_VERSION ? browserDocumentCodec : undefined;
      const mutated = applyBoardDiffToDoc(doc, previous, next, "local", codec);
      if (mutated) persistAwaiter.markPending();
    },
    awaitPersisted: (timeoutMs) => (destroyed ? Promise.resolve(true) : persistAwaiter.awaitPersisted(timeoutMs)),
    setFocus: (selectedBlockId, editingBlockId) => {
      if (!local) return;
      // Redundant broadcasts are dropped: this is called on every selection
      // change, and awareness has no idea the value did not move.
      if (local.selectedBlockId === selectedBlockId && local.editingBlockId === editingBlockId) return;
      local = { ...local, selectedBlockId, editingBlockId };
      awareness.setLocalState(local);
    },
    connected: () => provider.wsconnected,
    hasPendingChanges: () => !destroyed && (pendingBeforeSync || persistAwaiter.hasPendingChanges()),
    disconnect: () => provider.disconnect(),
    destroy: () => {
      destroyed = true;
      persistAwaiter.destroy();
      if (tokenTimer) clearInterval(tokenTimer);
      blocks.unobserveDeep(pushBoard);
      connectors.unobserveDeep(pushBoard);
      meta.unobserveDeep(pushBoard);
      fragments.unobserveDeep(pushBoard);
      fragments.unobserve(refreshDocumentSession);
      doc.off("afterTransaction", onDocumentTransaction);
      setDocumentSession(boardId, null);
      provider.off("sync", onSync);
      awareness.off("change", pushPeers);
      // Order matters: the local awareness state is cleared before the socket
      // goes, so peers see this person leave instead of keeping a ghost
      // cursor until their own timeout expires.
      awareness.setLocalState(null);
      provider.destroy();
      doc.destroy();
    },
  };
}
