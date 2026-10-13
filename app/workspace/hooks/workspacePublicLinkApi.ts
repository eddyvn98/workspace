/**
 * app/workspace/hooks/workspacePublicLinkApi.ts
 *
 * Fail-soft fetch wrappers around /api/workspaces/[id]/public-link.
 */

export interface WorkspacePublicLinkState {
  enabled: boolean;
  url: string | null;
  expiresAt: string | null;
}

export async function fetchPublicLinkState(
  boardId: string
): Promise<WorkspacePublicLinkState | null> {
  try {
    const res = await fetch(`/api/workspaces/${boardId}/public-link`);
    if (!res.ok) return null;
    return (await res.json()) as WorkspacePublicLinkState;
  } catch {
    return null;
  }
}

export async function enablePublicLink(
  boardId: string,
  expiration?: string
): Promise<WorkspacePublicLinkState | null> {
  try {
    for (const delay of [0, 250, 500, 1000, 1500]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const res = await fetch(`/api/workspaces/${boardId}/public-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expiration ? { expiration } : {}),
      });
      if (res.ok) return (await res.json()) as WorkspacePublicLinkState;
      if (res.status !== 404) return null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function updatePublicLinkExpiration(
  boardId: string,
  expiration: string
): Promise<WorkspacePublicLinkState | null> {
  try {
    const res = await fetch(`/api/workspaces/${boardId}/public-link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiration }),
    });
    if (!res.ok) return null;
    return (await res.json()) as WorkspacePublicLinkState;
  } catch {
    return null;
  }
}

export async function revokePublicLink(
  boardId: string
): Promise<WorkspacePublicLinkState | null> {
  try {
    const res = await fetch(`/api/workspaces/${boardId}/public-link`, {
      method: "DELETE",
    });
    if (!res.ok) return null;
    return (await res.json()) as WorkspacePublicLinkState;
  } catch {
    return null;
  }
}
