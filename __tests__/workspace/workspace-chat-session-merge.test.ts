import { describe, expect, it } from "vitest";
import type { WorkspaceChatSessionSummary } from "@/app/workspace/types/chat";
import { mergeWorkspaceChatSessions, type LocalWorkspaceChatSession } from "@/app/workspace/hooks/workspaceChatSessionMerge";

const remote = (updatedAt: string): WorkspaceChatSessionSummary => ({
  id: "server-session",
  difyConversationId: "conversation-1",
  title: "Old title",
  updatedAt,
});

const local = (updatedAt: string): LocalWorkspaceChatSession => ({
  id: "local-session",
  difyConversationId: "conversation-1",
  title: "Latest request",
  updatedAt,
  messages: [{ role: "assistant", content: "Latest persisted locally" }],
});

describe("mergeWorkspaceChatSessions", () => {
  it("keeps a newer local fallback when the server still returns an older session", () => {
    const merged = mergeWorkspaceChatSessions(
      [remote("2026-10-08T02:00:00.000Z")],
      [local("2026-10-08T03:00:00.000Z")],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "local-session", title: "Latest request" });
  });

  it("uses the server session when it is newer and keeps unrelated local sessions", () => {
    const unrelated = { ...local("2026-10-08T01:00:00.000Z"), difyConversationId: "conversation-2" };
    const merged = mergeWorkspaceChatSessions(
      [remote("2026-10-08T03:00:00.000Z")],
      [local("2026-10-08T02:00:00.000Z"), unrelated],
    );

    expect(merged.map((session) => session.id)).toEqual(["server-session", "local-session"]);
  });
});
