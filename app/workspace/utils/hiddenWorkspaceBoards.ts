/**
 * Hidden-board preferences.
 *
 * The server (app/api/workspaces/hidden) is the source of truth, so hiding a
 * board follows the user to another browser or device — that is the whole
 * point of the preference, and it used to be localStorage-only. localStorage
 * is kept as a mirror purely so the board menu can render the right rows on
 * the first paint, before the fetch resolves, and so hiding still behaves
 * sensibly while offline.
 */

const STORAGE_KEY = "workspace:hidden-shared-board-ids";

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // A private browsing quota error must not break board navigation.
  }
}

/** Cached ids for the first synchronous paint. Prefer
 *  fetchHiddenWorkspaceBoardIds for the authoritative list. */
export function listHiddenWorkspaceBoardIds(): string[] {
  return readIds();
}

/** Authoritative list from the server, with the local mirror refreshed to
 *  match. Falls back to the mirror when the request fails (logged out,
 *  offline) so the menu keeps working. */
export async function fetchHiddenWorkspaceBoardIds(): Promise<string[]> {
  try {
    const res = await fetch("/api/workspaces/hidden");
    if (!res.ok) return readIds();
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return readIds();
    const ids = data.filter((id): id is string => typeof id === "string");
    writeIds(ids);
    return ids;
  } catch {
    return readIds();
  }
}

export function hideWorkspaceBoard(id: string) {
  writeIds([...readIds(), id]);
  void fetch("/api/workspaces/hidden", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boardId: id }),
  }).catch(() => {
    // Fail-soft: the local mirror already hides it for this browser.
  });
}

export function restoreWorkspaceBoard(id: string) {
  writeIds(readIds().filter((hiddenId) => hiddenId !== id));
  void fetch(`/api/workspaces/hidden?boardId=${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {
    // Fail-soft, same reasoning as hideWorkspaceBoard.
  });
}
