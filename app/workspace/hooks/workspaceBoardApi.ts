/**
 * Fetch wrappers around /api/workspaces (see app/api/workspaces/**).
 * Every function is fail-soft — a network error, a 401 (logged out), or a
 * malformed response resolves cleanly without throwing, ensuring the workspace
 * engine can operate reliably.
 */
import { workspaceDocumentCheckpoint } from "../utils/workspaceDocumentCheckpoint";
import type { PlainBoard } from "@/lib/workspace/ydoc-shapes";
import { getKnownRevision, rememberRevision, forgetBoardRevision } from "./workspaceBoardRevision";
export { getKnownRevision, getKnownContent, rememberRevision, rememberRealtimeRevision, forgetBoardRevision } from "./workspaceBoardRevision";

export interface RemoteBoardSummary {
  id: string;
  title: string;
  updatedAt: string;
  /** ISO stamp; the board menu orders by it so a board never moves in the
   *  list once it has been created. Optional: rows created before the list
   *  route selected this column don't carry it. */
  createdAt?: string;
  ownerEmail?: string;
  viewerRole?: "OWNER" | "EDITOR" | "VIEWER";
  /** Whether this board is reachable by anyone other than its owner — the
   *  board menu's share icon. Server-only facts (a share roster row and the
   *  live public link), so they are absent on a board this browser knows
   *  only from its local index. */
  hasCollaborators?: boolean;
  hasPublicShareLink?: boolean;
}

export interface RemoteBoard extends RemoteBoardSummary {
  blocks: unknown;
  blockOrder: unknown;
  connectors: unknown;
  camera: unknown;
  frames?: unknown;
  treeLayoutDirection?: unknown;
  treeGrowthMode?: unknown;
  treeLayoutFamily?: unknown;
  treeTimelineBranchMode?: unknown;
  treeTimelineDescendantStyle?: unknown;
  treeCatalogDescendantStyle?: unknown;
  viewerRole?: "OWNER" | "EDITOR" | "VIEWER";
  revision?: number;
}

export interface RemoteBoardPayload {
  title: string;
  blocks: unknown;
  blockOrder: unknown;
  connectors: unknown;
  camera: unknown;
  frames?: unknown;
  treeLayoutDirection?: unknown;
  treeGrowthMode?: unknown;
  treeLayoutFamily?: unknown;
  treeTimelineBranchMode?: unknown;
  treeTimelineDescendantStyle?: unknown;
  treeCatalogDescendantStyle?: unknown;
  editOperation?: string;
}

export interface SaveBoardResult {
  ok: boolean;
  error?: string;
  board?: RemoteBoard;
  /** The board moved on since this tab loaded it (HTTP 409). Distinct from a
   *  plain failure: retrying is not the answer — the board has to be reloaded,
   *  or the save would overwrite whatever the other person just did. */
  conflict?: boolean;
}

export interface BoardMutationResult {
  ok: boolean;
  error?: string;
  status?: number;
}

export interface LegacyMindmapMigrationSummary {
  total: number;
  migrated: number;
  alreadyMigrated: number;
  failed: number;
  warnings: string[];
}

/** Runs the idempotent legacy cutover before a bare Workspace entry chooses a board. */
export async function migrateLegacyMindmapsToWorkspace(): Promise<LegacyMindmapMigrationSummary> {
  const res = await fetch("/api/workspaces/migrate-legacy", { method: "POST" });
  if (!res.ok) throw new Error(`Legacy mindmap migration failed (${res.status})`);
  const data = (await res.json()) as unknown;
  if (!data || typeof data !== "object") throw new Error("Legacy mindmap migration response was malformed");
  return data as LegacyMindmapMigrationSummary;
}

export async function fetchRemoteBoardList(): Promise<RemoteBoardSummary[]> {
  try {
    const res = await fetch("/api/workspaces");
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as RemoteBoardSummary[]) : [];
  } catch {
    return [];
  }
}

export async function fetchRemoteBoard(id: string): Promise<RemoteBoard | null> {
  try {
    const res = await fetch(`/api/workspaces/${id}?_t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as RemoteBoard;
  } catch {
    return null;
  }
}

export type BoardAccessResult =
  | { status: "ok"; board: RemoteBoard }
  | { status: "not_found_or_denied" }
  | { status: "error" };

/**
 * Distinguishes an explicit fetch failure from fetchRemoteBoard's plain
 * null (used when the caller needs to tell "a brand-new, never-saved board"
 * apart from "an id was given but the board can't be loaded / unauthorized").
 */
export async function checkBoardAccess(id: string, options?: { remember?: boolean }): Promise<BoardAccessResult> {
  try {
    const res = await fetch(`/api/workspaces/${id}`);
    if (res.status === 404 || res.status === 403) return { status: "not_found_or_denied" };
    if (!res.ok) return { status: "error" };
    const board = (await res.json()) as RemoteBoard;
    if (options?.remember !== false) rememberRevision(board);
    return { status: "ok", board };
  } catch {
    return { status: "error" };
  }
}

export async function saveRemoteBoard(
  id: string,
  payload: RemoteBoardPayload
): Promise<SaveBoardResult> {
  try {
    const baseRevision = getKnownRevision(id);
    const documentState = workspaceDocumentCheckpoint(id, payload as PlainBoard);
    const res = await fetch(`/api/workspaces/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // Absent for a board this tab has never loaded, which the server reads
      // as "cannot be ordered against a concurrent writer" and refuses. That
      // is the intended answer: a save that cannot name its base is the
      // blind overwrite this whole mechanism exists to stop.
      body: JSON.stringify({ ...payload, ...(baseRevision === undefined ? {} : { baseRevision }),
        ...(documentState ? { documentState } : {}) }),
    });
    if (!res.ok) {
      let errorMsg = "Failed to save workspace";
      let conflict = false;
      try {
        const json = (await res.json()) as { error?: string; reason?: string; revision?: number };
        if (json?.error && typeof json.error === "string") {
          errorMsg = json.error;
        }
        conflict = res.status === 409;
        // Deliberately NOT retried with the same content and the server's
        // newer revision: that would be the silent overwrite with extra
        // steps. The board has to be reloaded, so the revision is dropped.
        if (conflict) forgetBoardRevision(id);
      } catch {
        // use default errorMsg
      }
      return { ok: false, error: errorMsg, conflict };
    }
    const board = (await res.json()) as RemoteBoard;
    rememberRevision(board);
    return { ok: true, board };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error while saving workspace",
    };
  }
}

export async function deleteRemoteBoard(id: string): Promise<BoardMutationResult> {
  try {
    const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    if (!res.ok) {
      let errorMsg = "Failed to delete workspace";
      try {
        const json = (await res.json()) as { error?: string };
        if (json?.error && typeof json.error === "string") errorMsg = json.error;
      } catch {}
      return { ok: false, error: errorMsg, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error while deleting workspace",
    };
  }
}

export async function renameRemoteBoard(
  id: string,
  title: string
): Promise<BoardMutationResult> {
  try {
    // Reads the board fresh and sends back ITS content with its own revision
    // as the base: a rename must never overwrite content with a stale local
    // copy, and the server refuses any update to an existing board that does
    // not name the revision it was built on. Deliberately bypasses
    // saveRemoteBoard so the per-tab revision cache of an open board is not
    // replaced behind its autosave's back.
    const remote = await fetchRemoteBoard(id);
    if (!remote) return { ok: false, error: "Board not found", status: 404 };
    const res = await fetch(`/api/workspaces/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        blocks: remote.blocks ?? {},
        blockOrder: remote.blockOrder ?? [],
        connectors: remote.connectors ?? {},
        camera: remote.camera ?? {},
        ...(remote.frames !== undefined ? { frames: remote.frames } : {}),
        treeLayoutDirection: remote.treeLayoutDirection,
        treeGrowthMode: remote.treeGrowthMode,
        treeLayoutFamily: remote.treeLayoutFamily,
        treeTimelineBranchMode: remote.treeTimelineBranchMode,
        treeTimelineDescendantStyle: remote.treeTimelineDescendantStyle,
        treeCatalogDescendantStyle: remote.treeCatalogDescendantStyle,
        baseRevision: remote.revision,
      }),
    });
    if (res.ok) return { ok: true, status: res.status };
    let error = "Failed to rename workspace";
    try {
      const json = (await res.json()) as { error?: string };
      if (json?.error && typeof json.error === "string") error = json.error;
    } catch {
      // keep the default message
    }
    return { ok: false, error, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error while renaming workspace",
    };
  }
}
