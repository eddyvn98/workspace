import { clearBoardPendingCreate } from "../utils/selfCreatedBoards";
import type { BoardContent } from "../utils/mergeBoardConflict";

type Snapshot = { id: string; revision?: number; blocks: unknown; blockOrder: unknown; connectors: unknown };
const revisions = new Map<string, number>();
const contents = new Map<string, BoardContent>();
export const getKnownRevision = (id: string): number | undefined => revisions.get(id);
export const getKnownContent = (id: string): BoardContent | undefined => contents.get(id);

/** An actual REST snapshot is a valid three-way merge ancestor. */
export function rememberRevision(board: Snapshot | undefined): void {
  if (!board?.id || typeof board.revision !== "number" || board.revision < (revisions.get(board.id) ?? -1)) return;
  clearBoardPendingCreate(board.id);
  revisions.set(board.id, board.revision);
  contents.set(board.id, { blocks: board.blocks as Record<string, unknown>, blockOrder: board.blockOrder as string[], connectors: board.connectors as Record<string, unknown> });
}

/** A receipt confirms its captured update; the current UI may already contain a later, unsaved edit. */
export function rememberRealtimeRevision(id: string, revision: number): void {
  if (!Number.isInteger(revision) || revision <= (revisions.get(id) ?? -1)) return;
  revisions.set(id, revision);
  contents.delete(id);
  clearBoardPendingCreate(id);
}

/** Keep a known common ancestor on conflict, but require the revision to be relearned. */
export function forgetBoardRevision(id: string): void { revisions.delete(id); }
