export type WorkspaceRealtimeAccess =
  | { status: "ok"; token: string; wsUrl: string; role: "owner" | "EDITOR" | "VIEWER"; canWrite: boolean }
  | { status: "denied" | "unavailable" };

/** A denied request changes permissions. A network/configuration failure does not. */
export async function requestWorkspaceRealtimeAccess(boardId: string): Promise<WorkspaceRealtimeAccess> {
  try {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(boardId)}/ws-token`, { method: "POST" });
    if ([401, 403, 404].includes(response.status)) return { status: "denied" };
    if (!response.ok) return { status: "unavailable" };
    const body = await response.json();
    if (typeof body?.token !== "string" || typeof body?.wsUrl !== "string"
      || !["owner", "EDITOR", "VIEWER"].includes(body.role) || typeof body.canWrite !== "boolean"
      || body.canWrite !== (body.role !== "VIEWER") || (body.boardId !== undefined && body.boardId !== boardId)) {
      return { status: "unavailable" };
    }
    return { status: "ok", token: body.token, wsUrl: body.wsUrl, role: body.role, canWrite: body.canWrite };
  } catch { return { status: "unavailable" }; }
}
