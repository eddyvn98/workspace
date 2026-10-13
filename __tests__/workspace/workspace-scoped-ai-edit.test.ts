import { afterEach, describe, expect, it, vi } from "vitest";
import { runWorkspaceScopedAiEdit } from "@/app/workspace/hooks/workspaceScopedAiEdit";

describe("runWorkspaceScopedAiEdit", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a uniquely identified turn and exact target context through Workspace runtime", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ answer: "Saved" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWorkspaceScopedAiEdit({
      boardId: "board-1",
      modelSelector: "deepseek-v4-flash",
      query: "Improve this line",
      context: "Selected document blockId: doc-1. Selected lineId: line-1.",
    });

    expect(result).toBe("Saved");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/workspace-agent/chat");
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      boardId: "board-1",
      modelSelector: "deepseek-v4-flash",
      query: "Improve this line",
      context: "Selected document blockId: doc-1. Selected lineId: line-1.",
      conversationId: null,
    });
    expect(payload.turnId).toMatch(/^workspace-edit:[0-9a-f-]{36}$/i);
  });

  it("surfaces runtime failures and empty replies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(runWorkspaceScopedAiEdit({ boardId: "b", modelSelector: "m", query: "q", context: "c" }))
      .rejects.toThrow("Workspace AI request failed (503)");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ answer: "  " }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    await expect(runWorkspaceScopedAiEdit({ boardId: "b", modelSelector: "m", query: "q", context: "c" }))
      .rejects.toThrow("Could not read the AI response");
  });
});
