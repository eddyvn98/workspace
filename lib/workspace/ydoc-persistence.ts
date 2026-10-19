import * as Y from "yjs";

/** The room's own idle flush only fires this long after the *last* edit it
 *  saw (see WORKSPACE_WS_FLUSH_IDLE_MS / noteEdit's re-armed idle timer in
 *  docker/mindmap-ws/src/snapshot-scheduler.js, default 2000ms). A
 *  boardRevision ack that lands sooner than this after our own edit cannot be
 *  the flush that included it: a flush already scheduled or in flight before
 *  our edit reached the server cannot have captured content that did not
 *  exist yet at the moment it read the document. Such an ack is discarded —
 *  the scheduler always re-arms its idle timer on that later edit, so a
 *  further ack for it is still coming. This must stay >= the room's actual
 *  idle window or a stale ack could be mistaken for confirmation. */
const MIN_FLUSH_DELAY_MS = 2000;

/** How long `awaitPersisted` waits for the ws room's own flush before giving
 *  up. Comfortably above MIN_FLUSH_DELAY_MS so there is real time left for
 *  the network round trip once the room's idle window has actually elapsed. */
const DEFAULT_AWAIT_PERSIST_MS = 4500;

/** Tracks whether a room has an edit that has not yet been confirmed durable,
 *  and lets a caller wait for that confirmation. Split out from
 *  connectWorkspaceBoard so it can be exercised with a plain in-memory Y.Doc
 *  in a unit test, with no socket involved. */
export function createPersistenceAwaiter(meta: Y.Map<unknown>, doc?: Y.Doc) {
  let pendingSince: number | null = null;
  let pendingVector: Map<number, number> | null = null;
  let pendingRevision = -1;
  let confirmed = false;
  let disposed = false;
  const waiters = new Set<(ok: boolean) => void>();
  const onMetaChange = (event: Y.YMapEvent<unknown>) => {
    if (pendingSince === null) return;
    if (doc && meta.get("docProtocolVersion") === 1) {
      // A deadline flush or repository rebase must not acknowledge a later edit.
      // A state vector proves which Yjs structs the database actually contains.
      if (!event.keysChanged.has("docPersistedVector") || !pendingVector) return;
      try {
        const encoded = meta.get("docPersistedVector");
        if (typeof encoded !== "string") return;
        const saved = Y.decodeStateVector(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
        if ([...pendingVector].some(([client, clock]) => (saved.get(client) ?? 0) < clock)) return;
      } catch { return; }
    } else {
      if (!event.keysChanged.has("boardRevision") || Number(meta.get("boardRevision")) <= pendingRevision) return;
      if (Date.now() - pendingSince < MIN_FLUSH_DELAY_MS) return;
    }
    confirmed = true;
    for (const resolve of waiters) resolve(true);
    waiters.clear();
  };
  meta.observe(onMetaChange);
  return {
    hasPendingChanges: () => !disposed && pendingSince !== null && !confirmed,
    markPending: () => {
      if (doc && meta.get("docProtocolVersion") === 1) {
        // Deleting Yjs content alone does not advance a struct clock. A marker
        // in the same ordered update stream lets vectors acknowledge deletions too.
        doc.transact(() => {
          const edits = doc.getMap<number>("documentEdits");
          const key = String(doc.clientID);
          edits.set(key, (edits.get(key) ?? 0) + 1);
        }, "persistence-marker");
      }
      // Always the latest edit's timestamp, not the first unconfirmed one:
      // the server's own idle timer is re-armed on every edit, so the ack we
      // need to wait for is gated on the most recent one, exactly like the
      // room it mirrors.
      pendingSince = Date.now();
      pendingRevision = Number(meta.get("boardRevision") ?? -1);
      pendingVector = doc ? Y.decodeStateVector(Y.encodeStateVector(doc)) : null;
      confirmed = false;
    },
    awaitPersisted: (timeoutMs = DEFAULT_AWAIT_PERSIST_MS): Promise<boolean> => {
      if (disposed || pendingSince === null || confirmed) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (ok: boolean) => {
          if (settled) return;
          settled = true;
          waiters.delete(settle);
          clearTimeout(timer);
          resolve(ok);
        };
        waiters.add(settle);
        const timer = setTimeout(() => settle(false), timeoutMs);
        if (confirmed) settle(true);
      });
    },
    destroy: () => {
      disposed = true;
      meta.unobserve(onMetaChange);
      for (const resolve of waiters) resolve(false);
      waiters.clear();
    },
  };
}
