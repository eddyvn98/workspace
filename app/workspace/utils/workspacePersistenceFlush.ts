import { flushWorkspaceEditors } from "./workspaceEditorFlush";
import { isWorkspaceRealtimeLive } from "./workspaceRealtimeProjection";
import { flushWorkspaceRealtimePendingSave } from "./workspaceRealtimeFlush";

/** Resolves to whether the flush is known to have reached the database —
 *  `false` means the caller must not treat the board as freshly persisted. */
type FlushFn = (retryFailed?: boolean) => Promise<boolean>;

let activeFlush: { boardId: string; flush: FlushFn } | null = null;

/** useWorkspacePersistence registers the one REST flush implementation for
 *  the board it currently manages, so a caller in a different hook tree
 *  (chat send) can force a pending debounced autosave to reach the server
 *  before the AI reads the board over REST. Returns an unregister function to
 *  call on unmount/board change so a stale flush is never invoked. */
export function registerWorkspacePersistenceFlush(boardId: string, flush: FlushFn): () => void {
  const lease = { boardId, flush };
  activeFlush = lease;
  return () => { if (activeFlush === lease) activeFlush = null; };
}

export function hasWorkspacePersistenceFlush(boardId: string): boolean {
  return isWorkspaceRealtimeLive(boardId) || activeFlush?.boardId === boardId;
}

/** Waits for whichever persistence path currently owns this board — the live
 *  realtime room, or REST autosave — to commit any pending local edit before
 *  the caller reads the board. No-op (reports persisted) when neither is
 *  mounted for this board (e.g. tests, or a read-only viewer), so callers can
 *  invoke this unconditionally. Returns `false` when the underlying flush
 *  could not confirm persistence (a failed REST save, or the realtime room's
 *  ack not landing within its wait window) — callers must not silently treat
 *  that as a successful flush. */
export async function flushWorkspacePendingSave(boardId: string, retryFailed = false): Promise<boolean> {
  if (!await flushWorkspaceEditors(boardId)) return false;
  if (isWorkspaceRealtimeLive(boardId)) return flushWorkspaceRealtimePendingSave(boardId);
  if (activeFlush?.boardId === boardId) return retryFailed ? activeFlush.flush(true) : activeFlush.flush();
  return true;
}
