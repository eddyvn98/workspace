import type { SharedBoardSummary } from "../hooks/workspaceShareApi";

/** The shared board a bare `/workspace` visit should open when the account
 *  owns no board of its own: the most recently updated one the user has not
 *  hidden. Null means there is nothing to open and a new board is warranted. */
export function pickSharedBoardToOpen(
  shared: SharedBoardSummary[],
  hiddenIds: Iterable<string>,
): SharedBoardSummary | null {
  const hidden = new Set(hiddenIds);
  const candidates = shared.filter((board) => !hidden.has(board.id));
  if (candidates.length === 0) return null;
  const stamp = (board: SharedBoardSummary) => new Date(board.updatedAt).getTime() || 0;
  return candidates.reduce((latest, board) => (stamp(board) > stamp(latest) ? board : latest));
}
