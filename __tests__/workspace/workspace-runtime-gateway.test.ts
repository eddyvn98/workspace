import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), role: vi.fn(), board: vi.fn(), sign: vi.fn(), endpoint: vi.fn(), progress: vi.fn() }));
vi.mock("@/app/api/workspaces/_auth", () => ({ resolveWorkspaceCallerAuth: mocks.auth }));
vi.mock("@/app/api/workspaces/_access", () => ({ resolveAccessRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceBoard: { findUnique: mocks.board } } }));
vi.mock("@/lib/workspace/agentAuth", () => ({ signWorkspaceAgentUserToken: mocks.sign }));
vi.mock("@/app/config/difyEndpointResolver", () => ({ resolveDifyChatEndpoint: mocks.endpoint }));
vi.mock("@/lib/ai-usage/server/usage-recorder", () => ({ createUsageStreamObserver: vi.fn() }));
vi.mock("@/lib/workspace-agent/progressStore", () => ({ readWorkspaceTurnProgress: mocks.progress }));
import { POST } from "@/app/api/workspace-agent/chat/route";
const request = (extra = {}) => new NextRequest("http://localhost/api/workspace-agent/chat", { method: "POST", body: JSON.stringify({ boardId: "b", turnId: "t", query: "rename A", modelSelector: "GPT 5.6 Luna", context: "selected A", ...extra }) });
describe("Workspace runtime gateway", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("WORKSPACE_AGENT_SERVICE_KEY_LOCAL", "runtime-test-service-key");
    mocks.auth.mockResolvedValue({ ok: true, email: "actual@example.test" });
    mocks.role.mockResolvedValue("OWNER"); mocks.board.mockResolvedValue({ id: "b" });
    mocks.sign.mockResolvedValue({ token: "server-user-token" });
    mocks.progress.mockResolvedValue([]);
    mocks.endpoint.mockReturnValue({ url: "https://dify.example.test/v1/chat-messages", apiKey: "provider-secret" });
  });
  it("derives identity server-side and strips workflow credentials/internal traces from SSE", async () => {
    const turn = { answer: JSON.stringify({ answer: "Saved" }), conversationId: "c", receipts: [], focusBlockIds: [], appliedSummaries: [], unresolvedSummaries: [] };
    const fetcher = vi.fn().mockResolvedValue(Response.json(turn)); vi.stubGlobal("fetch", fetcher);
    const response = await POST(request({ user: "spoofed", inputs: { workspace_user_token: "spoofed", runtime_mode: "model_step" } }));
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(fetcher.mock.calls[0][0].toString()).toContain("/api/workspaces/b/agent/runtime");
    expect(fetcher.mock.calls[0][1].headers["X-Workspace-User-Token"]).toBe("server-user-token");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer runtime-test-service-key");
    expect(sent.workspace_user_token).toBe("server-user-token");
    expect(sent.modelSelector).toBe("openai/gpt-5.6-luna");
    expect(sent.query).toBe("rename A");
    const output = await response.text();
    expect(output).toContain("Saved"); expect(output).toContain("workflow_finished");
    expect(output).not.toContain("secret"); expect(output).not.toContain("node_finished");
    expect(mocks.progress).toHaveBeenCalled();
  });
  it("denies unauthorized boards before contacting Dify", async () => {
    mocks.role.mockResolvedValue(null); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await POST(request())).status).toBe(404); expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not expose upstream credential-bearing errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: "Bearer provider-secret" }, { status: 401 })); vi.stubGlobal("fetch", fetcher);
    const response = await POST(request()); expect(response.status).toBe(401); expect(await response.text()).not.toContain("provider-secret");
  });
});
