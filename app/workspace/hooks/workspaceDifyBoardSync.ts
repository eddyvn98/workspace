import type { BoardAccessResult } from "./workspaceBoardApi";

const BOARD_SYNC_RETRIES = 6;
const BOARD_SYNC_DELAY_MS = 350;

function waitForBoardSync(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

export async function fetchFreshBoard(boardId: string): Promise<BoardAccessResult> {
  try {
    const response = await fetch(`/api/workspaces/${boardId}`, { cache: "no-store" });
    if (response.status === 404 || response.status === 403) return { status: "not_found_or_denied" };
    if (!response.ok) return { status: "error" };
    return { status: "ok", board: await response.json() };
  } catch {
    return { status: "error" };
  }
}

export async function fetchBoardAfterAgent(
  boardId: string | null,
  before: BoardAccessResult | null,
) {
  let latest = boardId ? await fetchFreshBoard(boardId) : null;
  const beforeRevision = before?.status === "ok" ? before.board.revision : undefined;
  if (!boardId || before?.status !== "ok" || latest?.status !== "ok") return latest;

  for (let attempt = 0; attempt < BOARD_SYNC_RETRIES; attempt += 1) {
    const latestRevision = latest.board.revision;
    if (
      typeof beforeRevision === "number" &&
      typeof latestRevision === "number" &&
      latestRevision !== beforeRevision
    ) return latest;
    await waitForBoardSync(BOARD_SYNC_DELAY_MS);
    latest = await fetchFreshBoard(boardId);
    if (latest.status !== "ok") return latest;
  }
  return latest;
}
