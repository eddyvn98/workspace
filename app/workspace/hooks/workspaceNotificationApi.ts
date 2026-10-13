/**
 * Thin fetch wrappers around /api/workspaces/notifications — same fail-soft
 * convention as the other workspace*Api.ts modules.
 */

export type WorkspaceNotificationType = "NEW_COMMENT" | "SHARE_INVITE";

export interface WorkspaceNotification {
  id: string;
  recipientEmail: string;
  boardId: string;
  type: WorkspaceNotificationType;
  body: string;
  read: boolean;
  createdAt: string;
}

export async function fetchNotifications(): Promise<WorkspaceNotification[]> {
  try {
    const res = await fetch("/api/workspaces/notifications");
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as WorkspaceNotification[]) : [];
  } catch {
    return [];
  }
}

export async function setNotificationRead(id: string, read: boolean): Promise<void> {
  try {
    await fetch(`/api/workspaces/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });
  } catch {
    // Best-effort
  }
}
