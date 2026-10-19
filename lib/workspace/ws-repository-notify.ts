import type { BoardMetadata } from "./boardMetadata";
/**
 * Best-effort bridge from a committed workspace_action write (the Dify
 * Workspace Agent's POST /api/workspaces/[id]/agent, which writes straight to
 * Postgres via commitBoardContent() — see that file's header) to an open
 * workspace-ws room, so the mutation appears on an already-open canvas
 * immediately instead of only after that room's own idle/deadline flush
 * happens to notice a stale write and catch up (see
 * docker/mindmap-ws/src/workspace-persistence.js's catchUpAfterStale, which
 * remains the durability backstop if this call is lost).
 *
 * Reuses the mindmap channel's internal-auth env vars deliberately: this is
 * the exact same docker/mindmap-ws process, hosting both room kinds behind
 * one base URL and one server-to-server secret (see internal-auth.js) — a
 * second pair of env vars for the workspace side would configure the same
 * thing twice.
 *
 * `patch` names only the block/connector ids the action actually touched
 * (see docker/mindmap-ws/src/workspace-room-refresh.js for why this is a
 * targeted patch rather than a full-board merge): a live room may hold edits
 * this write never saw, since the agent read Postgres, not that room's
 * Y.Doc, and touching only what changed leaves everything else in the room
 * alone. `revision` is what the room orders this against — a duplicated or
 * out-of-order delivery is a no-op rather than a rollback.
 */

export interface WorkspaceAgentPatch {
  upsertBlocks: Record<string, unknown>;
  removeBlockIds: string[];
  upsertConnectors: Record<string, unknown>;
  removeConnectorIds: string[];
  blockOrder: string[];
  previousBlockOrder?: string[];
  metadata?: BoardMetadata;
  previousMetadata?: BoardMetadata;
}

export function workspaceRealtimeDeliveryConfigured(): boolean {
  return Boolean(process.env.WORKSPACE_WS_INTERNAL_URL
    ? process.env.WORKSPACE_WS_TOKEN_SECRET
    : process.env.MINDMAP_WS_INTERNAL_URL && process.env.MINDMAP_WS_TOKEN_SECRET);
}

export async function notifyWorkspaceAgentMutation(
  boardId: string,
  patch: WorkspaceAgentPatch,
  revision: number,
): Promise<void> {
  try {
    await postWorkspaceAgentPatch(boardId, patch, revision);
  } catch (err) {
    console.warn("[workspace] could not push the agent mutation into the realtime room:", err);
  }
}

export async function postWorkspaceAgentPatch(
  boardId: string,
  patch: WorkspaceAgentPatch,
  revision: number,
): Promise<void> {
  const internalUrl = process.env.WORKSPACE_WS_INTERNAL_URL || process.env.MINDMAP_WS_INTERNAL_URL;
  const secret = process.env.WORKSPACE_WS_INTERNAL_URL ? process.env.WORKSPACE_WS_TOKEN_SECRET : process.env.MINDMAP_WS_TOKEN_SECRET;
  if (!internalUrl || !secret) throw new Error("Workspace realtime delivery is not configured");

  const url = new URL("/internal/workspace-agent-patch", internalUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ boardId, patch, revision }),
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/** Computes the minimal { upsert, removeIds } delta between two id -> record
 *  maps, so a propagated patch touches only what an action actually changed
 *  rather than restating the whole board. Generic over blocks and connectors
 *  — both are plain id-keyed JSON records with the same shape of comparison. */
export function diffRecordMap(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { upsert: Record<string, unknown>; removeIds: string[] } {
  const upsert: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(after)) {
    if (JSON.stringify(before[id]) !== JSON.stringify(value)) upsert[id] = value;
  }
  const removeIds = Object.keys(before).filter((id) => !(id in after));
  return { upsert, removeIds };
}
