import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
	findUnique: vi.fn(),
	resolveWorkspaceCallerEmail: vi.fn(),
	resolveAccessRole: vi.fn(),
	signWorkspaceWsToken: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
	prisma: { workspaceBoard: { findUnique: mocks.findUnique } },
}));
vi.mock("@/app/api/workspaces/_auth", () => ({
	resolveWorkspaceCallerEmail: mocks.resolveWorkspaceCallerEmail,
}));
vi.mock("@/app/api/workspaces/_access", () => ({
	resolveAccessRole: mocks.resolveAccessRole,
}));
vi.mock("@/lib/workspace/ws-token", () => ({
	getWorkspaceWsSigningSecret: vi.fn(),
	signWorkspaceWsToken: mocks.signWorkspaceWsToken,
	WORKSPACE_WS_TOKEN_TTL_SECONDS: 60,
}));

import { POST } from "@/app/api/workspaces/[id]/ws-token/route";

describe("POST /api/workspaces/[id]/ws-token", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
		mocks.findUnique.mockReset().mockResolvedValue({ id: "board-123" });
		mocks.resolveWorkspaceCallerEmail.mockReset().mockResolvedValue("user@example.com");
		mocks.resolveAccessRole.mockReset().mockResolvedValue("OWNER");
		mocks.signWorkspaceWsToken.mockReset().mockResolvedValue("test-token");
	});

	async function getResponse() {
		const request = new NextRequest("https://app.example/api/workspaces/board-123/ws-token", { method: "POST" });
		return POST(request, { params: { id: "board-123" } });
	}

	it("uses the configured shared collaboration URL when Workspace has no override", async () => {
		vi.stubEnv("NEXT_PUBLIC_WORKSPACE_WS_URL", "");
		vi.stubEnv("NEXT_PUBLIC_MINDMAP_WS_URL", "wss://collab.example/ws");

		const response = await getResponse();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({ wsUrl: "wss://collab.example/ws" });
	});

	it("prefers an explicit Workspace collaboration URL", async () => {
		vi.stubEnv("NEXT_PUBLIC_WORKSPACE_WS_URL", "wss://workspace-collab.example/ws");
		vi.stubEnv("NEXT_PUBLIC_MINDMAP_WS_URL", "wss://collab.example/ws");

		const response = await getResponse();

		await expect(response.json()).resolves.toMatchObject({ wsUrl: "wss://workspace-collab.example/ws" });
	});
});
