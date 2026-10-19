/**
 * lib/workspace/ws-access-notify.ts
 *
 * Tells the realtime service (docker/mindmap-ws) that one person's access to
 * one workspace board just changed, so it can close whatever sockets they
 * still hold on that board's room. Workspace twin of
 * lib/mindmap/ws-access-notify.ts — same reasoning, same env vars (this is a
 * server-to-server call authenticated by the service's one shared internal
 * secret, not the per-connection workspace connect token from ws-token.ts;
 * see docker/mindmap-ws/src/internal-auth.js for why one secret covers every
 * /internal/* route regardless of which room kind it acts on).
 *
 * Needed because a realtime connection carries the role that was signed into
 * the connect token that opened it, and that connection can live for hours.
 * Editing a share to VIEWER, or revoking it outright, therefore had no effect
 * on somebody already sitting on the board — their socket kept the write
 * rights it was granted. After the eviction their client reconnects under the
 * new role (or, if access is gone, cannot reconnect at all).
 *
 * Best-effort by design: the share change itself is already committed to
 * Postgres when this runs, so a realtime service that is down or
 * unconfigured must never fail the API call. Every write path still
 * re-authorizes against the database, so the worst case of a missed eviction
 * is a stale socket, not a permission bypass on stored data.
 */

export async function notifyWorkspaceAccessChanged(
  boardId: string,
  userEmail: string,
): Promise<void> {
  const internalUrl = process.env.WORKSPACE_WS_INTERNAL_URL || process.env.MINDMAP_WS_INTERNAL_URL;
  const secret = process.env.WORKSPACE_WS_INTERNAL_URL ? process.env.WORKSPACE_WS_TOKEN_SECRET : process.env.MINDMAP_WS_TOKEN_SECRET;
  if (!internalUrl || !secret) return;

  try {
    const url = new URL("/internal/workspace-access-changed", internalUrl);
    await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ boardId, userEmail }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (err) {
    console.warn("[workspace] could not tell the realtime service about an access change:", err);
  }
}
