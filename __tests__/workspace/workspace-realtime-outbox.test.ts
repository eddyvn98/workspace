import { afterEach, describe, expect, it, vi } from "vitest";
import { postWorkspaceAgentPatch } from "@/lib/workspace/ws-repository-notify";
import { workspaceOutboxRetryDelayMs } from "@/lib/workspace/realtimeOutbox";

describe("Workspace realtime outbox delivery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requires a successful acknowledgement from the realtime service", async () => {
    vi.stubEnv("MINDMAP_WS_INTERNAL_URL", "http://realtime.invalid");
    vi.stubEnv("MINDMAP_WS_TOKEN_SECRET", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(postWorkspaceAgentPatch("board-1", {
      upsertBlocks: {}, removeBlockIds: [], upsertConnectors: {}, removeConnectorIds: [], blockOrder: [],
    }, 7)).rejects.toThrow("HTTP 503");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/internal/workspace-agent-patch", "http://realtime.invalid"),
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
  });

  it("backs off retries and caps the delay", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(workspaceOutboxRetryDelayMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});
