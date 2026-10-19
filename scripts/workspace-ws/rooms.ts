import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import type WebSocket from "ws";
import { createDocumentRoom, rebaseDocumentRoom, snapshotDocumentRoom, type StoredDocumentBoard } from "../../lib/workspace/document-room";
import { hasCollectionBlock } from "../../lib/workspace/collectionGuard";
import type { PeerIdentity, WorkspaceWsConfig } from "./config";
import { DocumentUpdateGuard } from "./guard";
import { RepositoryError, type WorkspaceRepository } from "./repository";

export interface RoomPeer {
  socket: WebSocket; identity: PeerIdentity; awarenessIds: Set<number>; alive: boolean; revoked: boolean;
}
export class WorkspaceRoom {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly peers = new Set<RoomPeer>();
  readonly awarenessOwners = new Map<number, RoomPeer>();
  closed = false;
  private guard: DocumentUpdateGuard;
  private base: StoredDocumentBoard;
  private persistedState: Uint8Array;
  private generation = 0;
  private savedGeneration = 0;
  private firstPendingAt: number | null = null;
  private lastEditAt = 0;
  private actorEmail: string | null = null;
  private retryAt = 0;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private serial: Promise<void> = Promise.resolve();
  private operations = 0;

  constructor(readonly boardId: string, board: StoredDocumentBoard, readonly config: WorkspaceWsConfig,
    private repository: WorkspaceRepository, private changed: () => void = () => {},
    private log: (message: string, error?: unknown) => void = console.warn) {
    if (hasCollectionBlock(board.blocks)) throw new RepositoryError(409, "collection_requires_rest");
    this.base = board; this.doc = createDocumentRoom(board);
    this.persistedState = Y.encodeStateAsUpdate(this.doc);
    this.guard = new DocumentUpdateGuard(this.doc, config);
    this.awareness = new Awareness(this.doc); this.awareness.setLocalState(null);
    this.doc.on("update", this.noteEdit);
  }
  get revision(): number { return this.base.revision ?? 0; }
  get dirty(): boolean { return this.generation !== this.savedGeneration; }
  get busy(): boolean { return this.operations > 0; }
  private noteEdit = (_update: Uint8Array, origin: unknown) => {
    if (!this.peers.has(origin as RoomPeer)) return;
    const peer = origin as RoomPeer;
    this.generation++; this.lastEditAt = Date.now(); this.firstPendingAt ??= this.lastEditAt;
    this.actorEmail = peer.identity.userEmail;
    this.schedule(); this.changed();
  };
  acceptUpdate(peer: RoomPeer, update: Uint8Array): void {
    if (this.closed || peer.revoked || !this.peers.has(peer) || peer.identity.role === "VIEWER") return;
    if (update.byteLength > this.config.maxMessageBytes) throw new Error("Update exceeds the size limit");
    const accepted = this.guard.check(update);
    Y.applyUpdate(this.doc, accepted, peer);
  }
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    if (this.closed || !this.dirty) return;
    const due = Math.max(this.retryAt, Math.min(this.lastEditAt + this.config.flushIdleMs,
      (this.firstPendingAt ?? Date.now()) + this.config.flushDeadlineMs));
    this.timer = setTimeout(() => { this.timer = null; void this.flush().catch(() => {}); }, Math.max(0, due - Date.now()));
    this.timer.unref?.();
  }
  private enqueue(action: () => Promise<void>): Promise<void> {
    this.operations++;
    const next = this.serial.then(action).finally(() => { this.operations--; this.changed(); });
    this.serial = next.catch(() => {});
    return next;
  }
  flush(): Promise<void> { return this.enqueue(() => this.flushNow()); }
  private writer(): string | null {
    // An ordinary disconnect does not revoke permission to persist accepted edits.
    // The repository rechecks the actor's current role for every save.
    this.actorEmail ??= [...this.peers].find((peer) => !peer.revoked && peer.identity.role !== "VIEWER")?.identity.userEmail ?? null;
    return this.actorEmail;
  }
  private revokeWriter(userEmail: string, reason: string): number {
    const normalized = userEmail.trim().toLowerCase();
    if (this.actorEmail === normalized) this.actorEmail = null;
    let count = 0;
    for (const peer of this.peers) if (peer.identity.userEmail === normalized && !peer.revoked) {
      peer.revoked = true; peer.socket.close(4403, reason); count++;
    }
    this.writer();
    return count;
  }
  private async saveSnapshot(snapshot: ReturnType<typeof snapshotDocumentRoom>): Promise<number> {
    for (let attempt = 0; attempt <= this.config.maxClientsPerRoom; attempt++) {
      const actor = this.writer();
      if (!actor) break;
      try { return await this.repository.save(this.boardId, snapshot, this.revision, actor); }
      catch (error) {
        const denied = error instanceof RepositoryError
          && (error.status === 403 || (error.status === 404 && error.reason !== "gone"));
        if (!denied) throw error;
        // Losing one writer must not discard updates already accepted from the room.
        this.revokeWriter(actor, error.reason);
      }
    }
    throw new RepositoryError(409, "no_authorized_writer");
  }
  private async flushNow(): Promise<void> {
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    if (this.closed || !this.dirty) return;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const generation = this.generation;
        const snapshot = snapshotDocumentRoom(this.doc);
        const persistedVector = Buffer.from(Y.encodeStateVector(this.doc)).toString("base64");
        try {
          const revision = await this.saveSnapshot(snapshot);
          if (this.closed) return;
          this.base = { ...snapshot, revision };
          this.persistedState = Buffer.from(snapshot.documentState, "base64");
          this.savedGeneration = generation;
          this.firstPendingAt = this.dirty ? this.lastEditAt : null;
          this.retryAt = 0; this.retries = 0;
          this.doc.transact(() => {
            this.doc.getMap("meta").set("boardRevision", revision);
            this.doc.getMap("meta").set("docPersistedVector", persistedVector);
          }, "receipt");
          this.schedule(); return;
        } catch (error) {
          if (!(error instanceof RepositoryError) || error.reason !== "stale") throw error;
          await this.reload();
        }
      }
      throw new RepositoryError(409, "stale");
    } catch (error) {
      if (error instanceof RepositoryError && error.terminal) {
        this.log(`[workspace-ws] Room ${this.boardId} stopped: ${error.reason}`);
        this.close(error.status === 404 ? 4404 : 4403, error.reason);
      } else {
        this.log(`[workspace-ws] Saving ${this.boardId} failed; retaining pending edits`, error);
        this.retryAt = Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(this.retries++, 5));
        this.schedule();
      }
      throw error;
    }
  }
  private async reload(): Promise<void> {
    const latest = await this.repository.load(this.boardId);
    if (this.closed || (latest.revision ?? 0) <= this.revision) return;
    if (hasCollectionBlock(latest.blocks)) throw new RepositoryError(409, "collection_requires_rest");
    this.persistedState = rebaseDocumentRoom(this.doc, this.persistedState, this.base, latest);
    this.base = latest;
  }
  refresh(revision?: number): Promise<void> {
    return this.enqueue(async () => {
      if (this.closed || (revision !== undefined && revision <= this.revision)) return;
      try { await this.reload(); }
      catch (error) {
        if (error instanceof RepositoryError && error.terminal) this.close(error.status === 404 ? 4404 : 4403, error.reason);
        throw error;
      }
    });
  }
  evict(userEmail: string): number {
    const count = this.revokeWriter(userEmail, "access_changed");
    if (this.actorEmail) this.retryAt = 0;
    this.schedule();
    return count;
  }
  close(code = 1001, reason = "room_closed"): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const peer of this.peers) { peer.revoked = true; peer.socket.close(code, reason); }
    this.doc.off("update", this.noteEdit);
    this.guard.destroy(); this.awareness.destroy(); this.doc.destroy(); this.changed();
  }
}
