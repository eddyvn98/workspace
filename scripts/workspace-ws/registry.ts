import type { PeerIdentity, WorkspaceWsConfig } from "./config";
import { createRepository, RepositoryError, type WorkspaceRepository } from "./repository";
import { WorkspaceRoom } from "./rooms";

/** Dirty rooms survive the last socket and transient repository failures. */
export class WorkspaceRooms {
  readonly rooms = new Map<string, WorkspaceRoom>();
  private loading = new Map<string, Promise<WorkspaceRoom>>();
  private refreshing = new Map<string, Promise<void>>();
  private idle = new Map<string, ReturnType<typeof setTimeout>>();
  private accessChanges = new Map<string, number>();
  private stopped = false;
  constructor(readonly config: WorkspaceWsConfig, private repository = createRepository(config),
    private log: (message: string, error?: unknown) => void = console.warn) {}
  async get(boardId: string): Promise<WorkspaceRoom> {
    if (this.stopped) throw new RepositoryError(503, "shutting_down");
    const current = this.rooms.get(boardId);
    if (current && !current.closed) {
      let refresh = this.refreshing.get(boardId);
      if (!refresh) {
        refresh = current.refresh().finally(() => this.refreshing.delete(boardId));
        this.refreshing.set(boardId, refresh);
      }
      await refresh; return current;
    }
    const loading = this.loading.get(boardId); if (loading) return loading;
    if (this.rooms.size + this.loading.size >= this.config.maxRooms) throw new RepositoryError(503, "room_capacity");
    const promise = this.repository.load(boardId).then((board) => {
      if (this.stopped) throw new RepositoryError(503, "shutting_down");
      const room = new WorkspaceRoom(boardId, board, this.config, this.repository, () => this.changed(boardId), this.log);
      this.rooms.set(boardId, room); this.changed(boardId); return room;
    }).finally(() => this.loading.delete(boardId));
    this.loading.set(boardId, promise); return promise;
  }
  changed(boardId: string): void {
    const timer = this.idle.get(boardId); if (timer) clearTimeout(timer); this.idle.delete(boardId);
    const room = this.rooms.get(boardId);
    if (!room) return;
    if (room.closed) { this.rooms.delete(boardId); return; }
    if (room.peers.size || room.dirty || room.busy) return;
    const next = setTimeout(() => {
      this.idle.delete(boardId);
      if (!room.closed && !room.peers.size && !room.dirty && !room.busy) room.close();
    }, this.config.idleRoomMs);
    next.unref?.(); this.idle.set(boardId, next);
  }
  async refresh(boardId: string, revision?: number): Promise<void> {
    const room = this.rooms.get(boardId) ?? await this.loading.get(boardId);
    if (room) await room.refresh(revision);
  }
  canJoin(identity: PeerIdentity): boolean {
    const changed = this.accessChanges.get(`${identity.boardId}:${identity.userEmail}`);
    return changed === undefined || (identity.issuedAt ?? 0) > changed;
  }
  evict(boardId: string, email: string): number {
    const now = Math.floor(Date.now() / 1000), normalized = email.trim().toLowerCase();
    for (const [key, time] of this.accessChanges) if (time < now - 70) this.accessChanges.delete(key);
    // Also fences an in-flight join or a reconnect reusing a token minted before the access change.
    this.accessChanges.set(`${boardId}:${normalized}`, now);
    return this.rooms.get(boardId)?.evict(normalized) ?? 0;
  }
  async shutdown(): Promise<void> {
    this.stopped = true;
    for (const timer of this.idle.values()) clearTimeout(timer); this.idle.clear();
    await Promise.allSettled(this.loading.values());
    const rooms = [...this.rooms.values()];
    for (const room of rooms) for (const peer of room.peers) { peer.revoked = true; peer.socket.close(1001, "server_shutdown"); }
    const results = await Promise.allSettled(rooms.map((room) => room.flush()));
    if (results.some((result) => result.status === "rejected") || rooms.some((room) => !room.closed && room.dirty)) {
      throw new Error("Pending workspace edits could not be saved; shutdown was not completed");
    }
    for (const room of rooms) room.close();
  }
}
export type { WorkspaceRepository };
