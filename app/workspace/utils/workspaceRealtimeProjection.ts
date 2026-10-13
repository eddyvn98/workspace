let skipNextPersistenceSnapshot = false;

/** Marks the next store update as a projection the realtime room already
 *  committed to the database itself (see useWorkspaceRealtime's onBoard), so
 *  useWorkspacePersistence must not re-save it over REST — its cached
 *  baseRevision is always one step behind what the room just wrote, which
 *  otherwise makes every incoming remote edit trigger a guaranteed 409. */
export function skipNextWorkspacePersistenceSnapshot(): void {
  skipNextPersistenceSnapshot = true;
}

export function consumeSkippedWorkspacePersistenceSnapshot(): boolean {
  const shouldSkip = skipNextPersistenceSnapshot;
  skipNextPersistenceSnapshot = false;
  return shouldSkip;
}

let skipNextRealtimePublish = false;

/** Marks the next store update as a hydration replay — the initial local
 *  snapshot, a REST board load, or an authoritative rollback after a failed
 *  save (see useWorkspacePersistence's `adopt`) — rather than a genuine local
 *  edit, so useWorkspaceRealtime's store subscriber does not republish it
 *  into the Yjs room. Without this, a REST hydration landing after the room
 *  has already synced the same content gets diffed as a "local" edit and
 *  arms the room's persistence awaiter; because the content is byte-identical
 *  to what the room already holds, the diff applied to the doc is a no-op,
 *  the server never sees a real change and never stamps a fresh
 *  `boardRevision`, and every later `awaitPersisted()` call then times out —
 *  reporting the board as never confirmed persisted even though there is
 *  nothing left to flush. */
export function skipNextWorkspaceRealtimePublish(): void {
  skipNextRealtimePublish = true;
}

export function consumeSkippedWorkspaceRealtimePublish(): boolean {
  const shouldSkip = skipNextRealtimePublish;
  skipNextRealtimePublish = false;
  return shouldSkip;
}

let liveRealtimeBoardId: string | null = null;

/** Marks whether a realtime room is currently connected for a board. While
 *  it is, the room is the sole writer of content changes — it flushes to the
 *  database itself (POST .../sync-board) with its own revision tracking that
 *  the browser never learns the number of, so useWorkspacePersistence's own
 *  REST autosave must stay out of the way entirely; racing the two against
 *  each other on every edit is what turned "someone is dragging a shape"
 *  into a guaranteed, continuous 409 loop. */
export function setWorkspaceRealtimeLive(boardId: string | null): void {
  liveRealtimeBoardId = boardId;
}

export function isWorkspaceRealtimeLive(boardId: string): boolean {
  return liveRealtimeBoardId === boardId;
}
