import { describe, expect, it, vi } from "vitest";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import type { WorkspaceRuntimeRequest } from "@/lib/workspace-agent/contracts";

const makeFlow = (prompt: string) => ({ type: "create_image_flow", prompt, mainMode: "Generate Image", subMode: "ARCHITECTURE" });

function input(query: string): WorkspaceRuntimeRequest {
	return { boardId: "board-1", turnId: "turn-1", query, modelSelector: "model", authorization: "Bearer token", workspaceUserToken: "user-token", canMutate: true, signal: new AbortController().signal };
}

describe("Workspace Image Flow creation count per turn", () => {
	it("does not execute a changed duplicate after one requested flow is saved", async () => {
		let revision = 1;
		const execute = vi.fn(async (_request, _turn, _round, _baseRevision, actions) => {
			revision += 1;
			return { httpStatus: 200, body: { success: true, revision, actions: actions.map((action) => ({ type: action.type, changed: true, ids: ["flow-step"] })) } };
		});
		const result = await runWorkspaceAgentTurn(input("Tạo một flow ảnh kiến trúc"), {
			readSnapshot: async () => ({ revision, title: "Board", blocks: {}, blockOrder: [], connectors: {} }),
			modelProvider: { propose: async ({ round }) => ({
				answer: JSON.stringify({ done: false, message: "Flow ready", actions: [makeFlow(round === 1 ? "Modern house at sunset" : "Photorealistic modern house at sunset")] }),
				conversationId: "dify-1",
			}) },
			execute,
		});

		expect(execute).toHaveBeenCalledTimes(1);
		expect(result.status).toBe("completed");
		expect(result.receipts.filter((receipt) => receipt.persisted)).toHaveLength(1);
		expect(result.unresolvedSummaries).toEqual([]);
	});

	it("allows the number of flows the user explicitly requested", async () => {
		let revision = 1;
		const execute = vi.fn(async (_request, _turn, _round, _baseRevision, actions) => {
			revision += 1;
			return { httpStatus: 200, body: { success: true, revision, actions: actions.map((action) => ({ type: action.type, changed: true, ids: [`flow-${revision}`] })) } };
		});
		const result = await runWorkspaceAgentTurn(input("Tạo hai flow ảnh kiến trúc"), {
			readSnapshot: async () => ({ revision, title: "Board", blocks: {}, blockOrder: [], connectors: {} }),
			modelProvider: { propose: async ({ round }) => ({
				answer: JSON.stringify({ done: round === 2, message: "Flows ready", actions: [makeFlow(`Architecture variation ${round}`)] }),
				conversationId: "dify-1",
			}) },
			execute,
		});

		expect(execute).toHaveBeenCalledTimes(2);
		expect(result.status).toBe("completed");
		expect(result.receipts.filter((receipt) => receipt.persisted)).toHaveLength(2);
	});
});
