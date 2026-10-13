/**
 * Thin fetch wrappers around /api/workspaces/[boardId]/versions — same fail-soft
 * convention as workspaceCommentApi.ts/workspaceShareApi.ts (network error / bad response -> null/[]).
 */

export interface WorkspaceSnapshotSummary {
  id: string;
  boardId: string;
  label: string | null;
  createdBy: string;
  createdAt: string;
}

export interface WorkspaceSnapshotDetail extends WorkspaceSnapshotSummary {
  blocks: Record<string, unknown>;
  blockOrder: string[];
  connectors: Record<string, unknown>;
}

export interface WorkspaceRestoredContent {
  blocks: Record<string, unknown>;
  blockOrder: string[];
  connectors: Record<string, unknown>;
  revision?: number;
}

export interface WorkspaceBlockEditEvent {
  id: string;
  actorEmail: string;
  opType: string;
  latestAt: string;
  nodeVersion?: Record<string, unknown> | null;
}

export async function listSnapshots(boardId: string): Promise<WorkspaceSnapshotSummary[]> {
  try {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(boardId)}/versions`);
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as WorkspaceSnapshotSummary[]) : [];
  } catch {
    return [];
  }
}

export async function saveSnapshot(
  boardId: string,
  label?: string,
): Promise<WorkspaceSnapshotSummary | null> {
  try {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(boardId)}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(label ? { label } : {}),
    });
    if (!res.ok) return null;
    return (await res.json()) as WorkspaceSnapshotSummary;
  } catch {
    return null;
  }
}

export async function getSnapshot(
  boardId: string,
  snapshotId: string,
): Promise<WorkspaceSnapshotDetail | null> {
  try {
    const res = await fetch(
      `/api/workspaces/${encodeURIComponent(boardId)}/versions/${encodeURIComponent(snapshotId)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { snapshot?: WorkspaceSnapshotDetail };
    return data.snapshot ?? null;
  } catch {
    return null;
  }
}

export async function getBlockHistory(
  boardId: string,
  blockId: string,
  before?: string,
): Promise<{ events: WorkspaceBlockEditEvent[]; nextCursor: string | null }> {
  try {
    const params = new URLSearchParams({ blockId });
    if (before) params.set("before", before);
    const res = await fetch(
      `/api/workspaces/${encodeURIComponent(boardId)}/edit-events/history?${params.toString()}`,
    );
    if (!res.ok) return { events: [], nextCursor: null };
    const data = (await res.json()) as { events?: WorkspaceBlockEditEvent[]; nextCursor?: string | null };
    return {
      events: Array.isArray(data.events) ? data.events : [],
      nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    };
  } catch {
    return { events: [], nextCursor: null };
  }
}

export async function restoreSnapshot(
  boardId: string,
  snapshotId: string,
): Promise<WorkspaceRestoredContent | null> {
  try {
    const res = await fetch(
      `/api/workspaces/${encodeURIComponent(boardId)}/versions/${encodeURIComponent(snapshotId)}/restore`,
      { method: "POST" },
    );
    if (!res.ok) return null;
    return (await res.json()) as WorkspaceRestoredContent;
  } catch {
    return null;
  }
}
