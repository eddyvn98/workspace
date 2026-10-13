/**
 * lib/workspace/resource-retention.ts
 *
 * P5 "scale" retention slice (see .claude/specs/active/workspace-resource-
 * architecture-plan.md) — orphaned WorkspaceResource GC. Mirrors
 * lib/meeting/audio/cleanupMeetingAudio.ts's shape: an opportunistic sweep,
 * throttled, fire-and-forget, triggered from a frequently-hit route rather
 * than a dedicated cron/queue (this app has no job-queue infra to hang one
 * off; see the architecture plan's P5 notes for what that would take).
 *
 * Multi-worker job processing and off-machine backup/rollback (the other two
 * P5 sub-items) are NOT covered here — both need infra this codebase doesn't
 * have yet (a real job queue, versioned/backed-up object storage) and are
 * left as open scoping work, not silently done.
 */

import { pruneOrphanedResources } from "./resource-repository";

/** How long a just-created resource is exempt from the orphan sweep — a
 *  resource row is written (createResource) before the board PUT that saves
 *  the block referencing it, so a fresh upload must not look orphaned while
 *  that save is still in flight. Override with
 *  WORKSPACE_RESOURCE_ORPHAN_GRACE_HOURS for a different local policy. */
const configuredGraceHours = Number(process.env.WORKSPACE_RESOURCE_ORPHAN_GRACE_HOURS);
const GRACE_MS = (Number.isFinite(configuredGraceHours) ? configuredGraceHours : 24) * 60 * 60 * 1000;

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // once per board per hour, at most
const lastSweepAt = new Map<string, number>();

function collectReferencedResourceIds(blocks: unknown): Set<string> {
  const ids = new Set<string>();
  if (!blocks || typeof blocks !== "object") return ids;
  for (const block of Object.values(blocks as Record<string, unknown>)) {
    if (!block || typeof block !== "object") continue;
    const { type, data } = block as { type?: unknown; data?: { resourceId?: unknown } };
    if (type !== "file") continue;
    if (data && typeof data.resourceId === "string") ids.add(data.resourceId);
  }
  return ids;
}

/** Best-effort, never throws — a GC failure must never break the board GET
 *  that triggered it. Returns the number of resources removed, for logging. */
export async function runResourceOrphanSweep(boardId: string, blocks: unknown): Promise<number> {
  try {
    const referenced = collectReferencedResourceIds(blocks);
    const removed = await pruneOrphanedResources(boardId, referenced, GRACE_MS);
    if (removed > 0) {
      console.log(`[workspace] resource GC: removed ${removed} orphaned resource(s) for board ${boardId}`);
    }
    return removed;
  } catch (err) {
    console.warn("[workspace] runResourceOrphanSweep failed:", err instanceof Error ? err.message : String(err));
    return 0;
  }
}

/** Opportunistic scheduler: call from GET /api/workspaces/[id] (the route
 *  every board open hits) instead of a dedicated cron. Fire-and-forget —
 *  never awaited by the caller, same convention as
 *  maybeRunScheduledCleanup() in cleanupMeetingAudio.ts. */
export function maybeRunResourceOrphanSweep(boardId: string, blocks: unknown): void {
  const now = Date.now();
  const last = lastSweepAt.get(boardId) ?? 0;
  if (now - last < SWEEP_INTERVAL_MS) return;
  lastSweepAt.set(boardId, now);
  void runResourceOrphanSweep(boardId, blocks);
}
