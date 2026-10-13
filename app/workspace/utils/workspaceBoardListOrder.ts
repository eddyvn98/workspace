import type { BoardIndexEntry } from "../hooks/useWorkspacePersistence";
import type { SharedBoardSummary } from "../hooks/workspaceShareApi";

/**
 * Newest board first, and a board never moves again.
 *
 * Ordering by last edit rearranged the menu under the reader every time
 * anything was touched — including merely opening a board, which counts as an
 * edit once autosave runs. Creation order is the one thing about a board that
 * never changes, so a board stays where the reader learned to find it. A row
 * written before the creation stamp existed falls back to what is known about
 * it. Ported from legacy's app/mindmap/hooks/mindmapListOrder.ts, which
 * removed the sort-by-edit behaviour on purpose.
 */
export function sortWorkspaceBoardsByCreation(entries: BoardIndexEntry[]): BoardIndexEntry[] {
  return [...entries].sort(
    (a, b) => (b.createdAt ?? b.updatedAt ?? 0) - (a.createdAt ?? a.updatedAt ?? 0),
  );
}

/** Merges the local index with the server's list, preferring whichever row is
 *  fresher — except for `createdAt`, which is not content: whichever side
 *  knows it keeps it, so ordering stays stable.
 *
 *  The two share flags are not content either, and unlike createdAt only the
 *  server can know them: the local index has no share roster and no token.
 *  So a remote row's flags are adopted even when the LOCAL row is fresher,
 *  which it routinely is — an autosave stamps localStorage before the list is
 *  re-fetched. Letting the fresher local row win outright would blank the
 *  share icon on the owner's own board every time they touched it. */
export function mergeWorkspaceBoards(
  local: BoardIndexEntry[],
  remote: BoardIndexEntry[],
): BoardIndexEntry[] {
  const byId = new Map<string, BoardIndexEntry>();
  for (const entry of local) byId.set(entry.id, entry);
  for (const entry of remote) {
    const existing = byId.get(entry.id);
    if (!existing || entry.updatedAt > existing.updatedAt) {
      byId.set(entry.id, { ...entry, createdAt: entry.createdAt ?? existing?.createdAt });
      continue;
    }
    byId.set(entry.id, {
      ...existing,
      createdAt: existing.createdAt ?? entry.createdAt,
      hasCollaborators: entry.hasCollaborators,
      hasPublicShareLink: entry.hasPublicShareLink,
    });
  }
  return sortWorkspaceBoardsByCreation([...byId.values()]);
}

/**
 * Whether a shared board changed since this person last had it open.
 *
 * The dot is about work OTHER people did while you were away. Only shared
 * boards qualify — on a board nobody else can reach, your own edits and
 * autosave bump updatedAt exactly like a collaborator's would. The board
 * currently open is never marked, since you are looking at it right now.
 * Same reasoning as legacy's hasUnseenUpdates in MindmapListPanel.tsx.
 */
export function hasUnseenBoardUpdates(
  board: SharedBoardSummary,
  lastSeen: Record<string, string>,
  currentBoardId: string | null,
): boolean {
  if (board.id === currentBoardId) return false;
  const seenAt = lastSeen[board.id];
  if (!seenAt) return true;
  return Date.parse(board.updatedAt) > Date.parse(seenAt);
}
