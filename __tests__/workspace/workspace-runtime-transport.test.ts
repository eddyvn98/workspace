// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ legacy: vi.fn(), consume: vi.fn(), stop: vi.fn() }));
vi.mock("@/app/workspace/hooks/workspaceChatDifySend", () => ({ sendToDifyWithRepair: mocks.legacy }));
vi.mock("@/app/workspace/utils/workspaceChatStream", () => ({ consumeWorkspaceChatResponse: mocks.consume }));
vi.mock("@/app/workspace/hooks/workspaceChatSendHelpers", () => ({ stopDifyTask: mocks.stop }));
import { difyWorkspaceAgentProvider, isWorkspaceRuntimePilot, resolveWorkspaceRuntimePilot, type WorkspaceAgentTurn } from "@/app/workspace/hooks/workspaceChatTransport";
const input = (): WorkspaceAgentTurn => ({
  boardId: "board", turnId: "turn", runtime: false, context: "selected node id: n1", modelIdentifier: "GPT 5.6 Luna",
  promptToSend: "legacy prompt", userDisplayContent: "Đổi tên A thành B", user: "test@example.test",
  filesPayload: [], conversationId: null, signal: new AbortController().signal, onTaskId: vi.fn(),
});
describe("Workspace provider boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/workspace"); });
  afterEach(() => { vi.unstubAllEnvs(); });
  it("keeps legacy default and delegates the original contract", async () => {
    mocks.legacy.mockResolvedValue({ fullText: "legacy", conversationId: "c", invalidActionResponse: false });
    expect(isWorkspaceRuntimePilot()).toBe(false);
    const turn = input();
    expect((await difyWorkspaceAgentProvider.send(turn)).fullText).toBe("legacy");
    expect(mocks.legacy).toHaveBeenCalledWith(turn);
  });
  it("supports a staging default and a URL rollback override", () => {
    expect(resolveWorkspaceRuntimePilot("/workspace", true)).toBe(true);
    expect(resolveWorkspaceRuntimePilot("?agentRuntime=0", true)).toBe(false);
    expect(resolveWorkspaceRuntimePilot("?agentRuntime=1", false)).toBe(true);
    expect(resolveWorkspaceRuntimePilot("", false)).toBe(false);
  });
  it("uses the build default unless the URL explicitly opts out", () => {
    vi.stubEnv("NEXT_PUBLIC_WORKSPACE_RUNTIME_DEFAULT", "1");
    expect(isWorkspaceRuntimePilot()).toBe(true);
    window.history.replaceState({}, "", "/workspace?agentRuntime=0");
    expect(isWorkspaceRuntimePilot()).toBe(false);
  });
  it("sends original user query to Dify log and context separately with stable turn ID", async () => {
    window.history.replaceState({}, "", "/workspace?agentRuntime=1");
    expect(isWorkspaceRuntimePilot()).toBe(true);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, body: {} });
    vi.stubGlobal("fetch", fetcher);
    mocks.consume.mockResolvedValue({ answer: '{"answer":"saved"}', conversationId: "c" });
    await difyWorkspaceAgentProvider.send({ ...input(), runtime: true });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.query).toBe("Đổi tên A thành B");
    expect(body).toMatchObject({ turnId: "turn", context: "selected node id: n1", modelSelector: "GPT 5.6 Luna" });
    expect(fetcher.mock.calls[0][0]).toBe("/api/workspace-agent/chat");
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("cancels runtime even before Dify has sent a task ID", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetcher);
    await difyWorkspaceAgentProvider.cancel({ boardId: "board", turnId: "turn", user: "test@example.test" });
    expect(fetcher.mock.calls[0][0]).toBe("/api/workspaces/board/agent/runtime/cancel");
    expect(mocks.stop).not.toHaveBeenCalled();
  });
  it("fails closed for runtime attachments without calling the provider", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(difyWorkspaceAgentProvider.send({ ...input(), runtime: true, filesPayload: [{ type: "document", transfer_method: "local_file", url: "", upload_file_id: "f" }] })).rejects.toThrow("attachments");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
