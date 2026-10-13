import type { WorkspaceComment } from "../hooks/workspaceCommentApi";

/** Number of comments on a board, or null when it cannot be read. Used to tell
 *  a chat turn that only added comments (which never change the board's
 *  revision) apart from one that claimed a change and did nothing. */
export async function fetchBoardCommentSnapshot(boardId: string): Promise<WorkspaceComment[] | null> {
  try {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(boardId)}/comments`);
    if (!response.ok) return null;
    const comments = (await response.json()) as unknown;
    return Array.isArray(comments) ? comments as WorkspaceComment[] : null;
  } catch {
    return null;
  }
}

export async function fetchBoardCommentCount(boardId: string): Promise<number | null> {
  return (await fetchBoardCommentSnapshot(boardId))?.length ?? null;
}

export function countCommentChanges(before: WorkspaceComment[] | null, after: WorkspaceComment[] | null): number {
  if (!before || !after) return 0;
  const previous = new Map(before.map((comment) => [comment.id, comment]));
  const current = new Map(after.map((comment) => [comment.id, comment]));
  let changed = before.filter((comment) => !current.has(comment.id)).length;
  for (const comment of after) {
    const old = previous.get(comment.id);
    if (!old || old.body !== comment.body || old.resolved !== comment.resolved) changed += 1;
  }
  return changed;
}
