/**
 * Thin fetch wrappers around /api/workspaces/[id]/shares and the
 * ?scope=shared board-list endpoint — same fail-soft convention as
 * workspaceBoardApi.ts (network error / bad response → null/[]).
 */

export type WorkspaceShareRole = "VIEWER" | "EDITOR";

export interface WorkspaceShare {
  id: string;
  boardId: string;
  invitedEmail: string;
  role: WorkspaceShareRole;
  invitedBy: string;
  createdAt: string;
}

export interface SharedBoardSummary {
  id: string;
  title: string;
  updatedAt: string;
  ownerEmail: string;
  role: WorkspaceShareRole;
}

export async function fetchSharedBoardList(): Promise<SharedBoardSummary[]> {
  try {
    const res = await fetch("/api/workspaces?scope=shared");
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as SharedBoardSummary[]) : [];
  } catch {
    return [];
  }
}

export async function fetchBoardShares(boardId: string): Promise<WorkspaceShare[]> {
  try {
    const res = await fetch(`/api/workspaces/${boardId}/shares`);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as WorkspaceShare[]) : [];
  } catch {
    return [];
  }
}

export async function addBoardShare(
  boardId: string,
  invitedEmail: string,
  role: WorkspaceShareRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/workspaces/${boardId}/shares`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitedEmail, role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: typeof body.error === "string" ? body.error : "Failed to share" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function updateBoardShareRole(
  boardId: string,
  invitedEmail: string,
  role: WorkspaceShareRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return addBoardShare(boardId, invitedEmail, role);
}

export async function removeBoardShare(
  boardId: string,
  invitedEmail: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/workspaces/${boardId}/shares?email=${encodeURIComponent(invitedEmail)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: typeof body.error === "string" ? body.error : "Failed to remove collaborator" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function leaveSharedBoard(boardId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/workspaces/${boardId}/access`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: typeof body.error === "string" ? body.error : "Failed to leave shared board" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}
