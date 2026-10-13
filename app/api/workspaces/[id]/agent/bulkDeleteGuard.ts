import { NextResponse } from "next/server";

const MIN_REMOVED = 5;

type JsonMap = Record<string, unknown>;

/** Blocks a turn that would wipe out most of the board unless the user was
 * asked first. Runs before anything is persisted, so nothing needs undoing. */
export function bulkDeleteGuard(
  actions: JsonMap[],
  blocksBefore: unknown,
  stateBlocks: Record<string, unknown>,
  revision: number,
): NextResponse | null {
  if (actions.some((action) => action.confirmBulkDelete === true || (action.params as JsonMap | undefined)?.confirmBulkDelete === true)) return null;
  const before = Object.keys((blocksBefore ?? {}) as JsonMap);
  const removed = before.filter((id) => !(id in stateBlocks)).length;
  if (removed < MIN_REMOVED || removed * 2 < before.length) return null;
  return NextResponse.json({
    error: `This would delete ${removed} of ${before.length} blocks. Ask the user to confirm first; only after they say yes, repeat the same action with confirmBulkDelete: true.`,
    reason: "bulk_delete_needs_confirmation",
    removeCount: removed,
    blockCount: before.length,
    revision,
  }, { status: 409 });
}
