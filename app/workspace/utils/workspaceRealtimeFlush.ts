type RealtimeFlushFn = (timeoutMs?: number) => Promise<boolean>;

let activeFlush: { boardId: string; flush: RealtimeFlushFn } | null = null;

/** useWorkspaceRealtime registers the flush for the board whose live room it
 *  currently owns. While a room is live it is the sole writer of content
 *  (see workspaceRealtimeProjection.ts), so this is the realtime counterpart
 *  to workspacePersistenceFlush.ts's REST registration — the seam a caller
 *  outside the hook tree (chat send) uses to wait for the room's own
 *  idle/deadline flush before trusting a server-side board read. */
export function registerWorkspaceRealtimeFlush(boardId: string, flush: RealtimeFlushFn): () => void {
  activeFlush = { boardId, flush };
  return () => {
    if (activeFlush?.boardId === boardId) activeFlush = null;
  };
}

/** No-op (reports persisted) when no live room is registered for this board —
 *  callers can invoke this unconditionally alongside the REST flush. */
export async function flushWorkspaceRealtimePendingSave(boardId: string, timeoutMs?: number): Promise<boolean> {
  if (activeFlush?.boardId === boardId) return activeFlush.flush(timeoutMs);
  return true;
}
