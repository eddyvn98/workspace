import type { WorkspaceChatMessage, WorkspaceChatSessionSummary } from "../types/chat";

export type LocalWorkspaceChatSession = WorkspaceChatSessionSummary & {
  messages: WorkspaceChatMessage[];
  workspaceBoardId?: string;
  difyConversationId: string;
};

function timestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Keep a newer local fallback when a session write failed but the server list is stale. */
export function mergeWorkspaceChatSessions(
  remote: WorkspaceChatSessionSummary[],
  local: LocalWorkspaceChatSession[],
): WorkspaceChatSessionSummary[] {
  const sessions = new Map<string, WorkspaceChatSessionSummary>();
  for (const session of remote) {
    sessions.set(session.difyConversationId || session.id, session);
  }
  for (const session of local) {
    const key = session.difyConversationId || session.id;
    const current = sessions.get(key);
    if (!current || timestamp(session.updatedAt) >= timestamp(current.updatedAt)) {
      sessions.set(key, session);
    }
  }
  return [...sessions.values()].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
}
