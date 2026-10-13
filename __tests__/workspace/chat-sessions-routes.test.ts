import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  email: vi.fn<() => Promise<string | null>>(),
  access: vi.fn<() => Promise<string | null>>(),
  board: vi.fn(),
  list: vi.fn(),
  upsert: vi.fn(),
  byId: vi.fn(),
  endpoint: vi.fn(),
}));
vi.mock("@/app/api/workspaces/_auth", () => ({ resolveWorkspaceCallerEmail: mocks.email }));
vi.mock("@/app/api/workspaces/_access", () => ({ resolveAccessRole: mocks.access }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceBoard: { findUnique: mocks.board } } }));
vi.mock("@/services/mongodb/chatSessions.repo", () => ({
  listChatSessions: mocks.list, upsertChatSession: mocks.upsert, getChatSessionById: mocks.byId,
}));
vi.mock("@/app/config/difyEndpointResolver", () => ({ resolveDifyChatEndpoint: mocks.endpoint }));

import { GET as listSessions, POST as saveSession } from "@/app/api/chat-sessions/route";
import { GET as readMessages } from "@/app/api/chat-sessions/[id]/messages/route";

const endpoint = (path: string, opts?: RequestInit) => new NextRequest("http://localhost:3014" + path, opts);
const boardId = "board-1";
const convId = "dify-uuid-1";
const category = "WORKSPACE_AGENT_CHAT_KEY";
const stored = {
  id: "session-1", userId: "user@example.com", category, region: null,
  workspaceBoardId: boardId, difyConversationId: convId,
  title: "Update status", pinned: false, pinnedAt: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  workspaceMessages: [{ role: "user", content: "Set Done" }, { role: "assistant", content: "Done", appliedSummaries: ["updated"] }],
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.email.mockResolvedValue("user@example.com");
  mocks.access.mockResolvedValue("EDITOR");
  mocks.board.mockResolvedValue({ id: boardId, ownerEmail: "user@example.com" });
  mocks.list.mockResolvedValue({ items: [stored], nextCursor: null });
  mocks.upsert.mockResolvedValue(stored);
  mocks.byId.mockResolvedValue(stored);
});

describe("Workspace chat history routes", () => {
  it("returns 401 without a signed-in user and never contacts Mongo", async () => {
    mocks.email.mockResolvedValue(null);
    const res = await listSessions(endpoint("/api/chat-sessions?category=" + category + "&workspaceBoardId=" + boardId));
    expect(res.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("lists only authorized board-scoped sessions using server-side identity", async () => {
    const res = await listSessions(endpoint("/api/chat-sessions?category=" + category + "&workspaceBoardId=" + boardId));
    expect(res.status).toBe(200);
    expect((await res.json()).items[0].id).toBe("session-1");
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user@example.com", workspaceBoardId: boardId, categories: [category],
    }));
  });
  it("reports 404 for inaccessible board history", async () => {
    mocks.access.mockResolvedValue(null);
    mocks.board.mockResolvedValue({ id: boardId, ownerEmail: "other@example.com" });
    const res = await listSessions(endpoint("/api/chat-sessions?category=" + category + "&workspaceBoardId=" + boardId));
    expect(res.status).toBe(404);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("upserts bounded Workspace transcript and never trusts caller-supplied userId", async () => {
    const res = await saveSession(endpoint("/api/chat-sessions", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, workspaceBoardId: boardId, difyConversationId: convId, title: "Update status",
        userId: "attacker@example.com", workspaceMessages: stored.workspaceMessages }) }));
    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user@example.com", workspaceBoardId: boardId, workspaceMessages: stored.workspaceMessages,
    }));
  });
  it("rejects missing board and oversized transcript", async () => {
    const bad = endpoint("/api/chat-sessions", { method: "POST", body: JSON.stringify({ category, difyConversationId: convId }) });
    expect((await saveSession(bad)).status).toBe(400);
    const oversized = endpoint("/api/chat-sessions", { method: "POST", body: JSON.stringify({
      category, workspaceBoardId: boardId, difyConversationId: convId,
      workspaceMessages: [{ role: "assistant", content: "A".repeat(17000) }],
    }) });
    expect((await saveSession(oversized)).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("reads the saved Workspace-facing transcript without asking Dify to execute anything", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await readMessages(endpoint("/api/chat-sessions/session-1/messages"), { params: { id: "session-1" } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source).toBe("workspace_snapshot");
    expect(body.conversation_id).toBe(convId);
    expect(body.messages[1].appliedSummaries).toEqual(["updated"]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("hides sessions belonging to other authenticated users", async () => {
    mocks.byId.mockResolvedValue({ ...stored, userId: "other@example.com" });
    const res = await readMessages(endpoint("/api/chat-sessions/session-1/messages"), { params: { id: "session-1" } });
    expect(res.status).toBe(404);
  });
  it("loads legacy Dify message history as read-only data, never exposing the API key", async () => {
    mocks.byId.mockResolvedValue({ ...stored, workspaceMessages: undefined });
    mocks.endpoint.mockReturnValue({ url: "https://dify.example/v1/chat-messages", apiKey: "test-secret" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: [{ query: "Set Done", answer: "Done", conversation_id: convId }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await readMessages(endpoint("/api/chat-sessions/session-1/messages"), { params: { id: "session-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("dify");
    expect(body.data).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("test-secret");
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1/messages");
    expect(url.searchParams.get("conversation_id")).toBe(convId);
    expect(url.searchParams.get("user")).toBe("user@example.com");
    vi.unstubAllGlobals();
  });
});
