import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
	resolveCategoryProvider: vi.fn(),
	resolveWorkspaceCallerEmail: vi.fn(),
	requireBoardWrite: vi.fn(),
	getToken: vi.fn(),
}));

vi.mock("@/app/config/categoryProviderResolver", () => ({
	resolveCategoryProvider: mocks.resolveCategoryProvider,
}));
vi.mock("@/app/api/workspaces/_auth", () => ({
	resolveWorkspaceCallerEmail: mocks.resolveWorkspaceCallerEmail,
}));
vi.mock("@/lib/workspace/knowledge-repository", () => ({
	requireBoardWrite: mocks.requireBoardWrite,
	WorkspaceAccessError: class WorkspaceAccessError extends Error {},
}));
vi.mock("next-auth/jwt", () => ({ getToken: mocks.getToken }));

import { POST } from "@/app/api/chat/files/route";

describe("POST /api/chat/files", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		vi.stubEnv("NEXT_PUBLIC_AGENT_API_URL", "https://dify.example/v1/chat-messages");
		vi.stubEnv("WORKSPACE_AGENT_LOCAL_DIFY_API_KEY", "workspace-app-key");
		vi.stubEnv("WORKSPACE_AGENT_LOCAL_DIFY_API_URL", "");
		vi.stubEnv("WORKSPACE_AGENT_DIFY_API_URL", "");
		vi.stubEnv("WORKSPACE_DEV_USER_EMAIL", "");
		mocks.resolveCategoryProvider.mockReset().mockReturnValue({ apiKey: "general-app-key" });
		mocks.resolveWorkspaceCallerEmail.mockReset().mockResolvedValue("user@example.com");
		mocks.requireBoardWrite.mockReset().mockResolvedValue(undefined);
		mocks.getToken.mockReset();
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ id: "dify-file-id" }), { status: 200 }),
		));
	});

	it("uploads Workspace files under the same authenticated Dify user used by chat", async () => {
		const form = new FormData();
		form.append("file", new Blob(["safe test"], { type: "text/plain" }), "probe.txt");
		form.append("workspace_id", "board-123");
		const request = new NextRequest("https://app.example/api/chat/files", {
			method: "POST",
			headers: { "x-category": "WORKSPACE_AGENT_CHAT_KEY" },
			body: form,
		});

		const response = await POST(request);

		expect(response.status).toBe(200);
		expect(mocks.requireBoardWrite).toHaveBeenCalledWith("board-123", "user@example.com");
		const [, init] = vi.mocked(fetch).mock.calls[0];
		expect((init?.body as FormData).get("user")).toBe("user@example.com");
	});
});
