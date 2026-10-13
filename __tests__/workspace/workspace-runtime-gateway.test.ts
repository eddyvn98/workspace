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
    mocks.auth.mockResolvedValue({ ok: true, email: "actual@example.test" });
    mocks.role.mockResolvedValue("OWNER"); mocks.board.mockResolvedValue({ id: "b" });
    mocks.sign.mockResolvedValue({ token: "server-user-token" });
    mocks.progress.mockResolvedValue([]);
    mocks.endpoint.mockReturnValue({ url: "https://dify.example.test/v1/chat-messages", apiKey: "provider-secret" });
  });
  it("derives identity server-side and strips workflow credentials/internal traces from SSE", async () => {
    const events = [
      { event: "workflow_started", data: { token: "secret-internal" } },
      { event: "node_finished", data: { headers: "secret-service-key" } },
      { event: "message", answer: '{"answer":"Saved"}', conversation_id: "c", task_id: "task", metadata: { token: "secret-internal" } },
      { event: "message_end", metadata: { secret: "secret-internal" } },
    ].map(x => `data: ${JSON.stringify(x)}\n\n`).join("");
    const fetcher = vi.fn().mockResolvedValue(new Response(events)); vi.stubGlobal("fetch", fetcher);
    const response = await POST(request({ user: "spoofed", inputs: { workspace_user_token: "spoofed", runtime_mode: "model_step" } }));
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(sent.user).toBe("actual@example.test");
    expect(sent.inputs).toMatchObject({ workspace_user_token: "server-user-token", runtime_mode: "runtime", model_selector: "openai/gpt-5.6-luna" });
    expect(sent.query).toBe("rename A");
    const output = await response.text();
    expect(output).toContain("Saved"); expect(output).toContain('"task_id":"task"');
    expect(output).not.toContain("secret"); expect(output).not.toContain("node_finished");
    expect(mocks.progress).toHaveBeenCalledWith({ boardId: "b", actorEmail: "actual@example.test", turnId: "t" }, 0, expect.stringMatching(/^[a-f0-9]{64}$/));
  });
  it("denies unauthorized boards before contacting Dify", async () => {
    mocks.role.mockResolvedValue(null); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await POST(request())).status).toBe(404); expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not expose upstream credential-bearing errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('Bearer provider-secret', { status: 401 })); vi.stubGlobal("fetch", fetcher);
    const response = await POST(request()); expect(response.status).toBe(502); expect(await response.text()).not.toContain("provider-secret");
  });
});
