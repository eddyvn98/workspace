import { describe, expect, it, vi } from "vitest";
import { consumeWorkspaceChatResponse } from "@/app/workspace/utils/workspaceChatStream";

describe("workspace runtime progress stream", () => {
  it("keeps progress out of the final answer and ignores stale sequence numbers", async () => {
    const frames = [
      { event: "workspace_runtime_progress", sequence: 1, phase: "model_step", answer: "not an answer" },
      { event: "message", answer: "intermediate model text" },
      { event: "workspace_runtime_progress", sequence: 2, phase: "persisted", persistedCount: 2 },
      { event: "workspace_runtime_progress", sequence: 2, phase: "completed" },
      { event: "workflow_finished", data: { outputs: { answer: "{\"actions\":[],\"done\":true,\"message\":\"Saved\"}" } } },
    ].map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("");
    const response = new Response(frames, { headers: { "content-type": "text/event-stream" } });
    const onText = vi.fn();
    const onProgress = vi.fn();

    const result = await consumeWorkspaceChatResponse(response, onText, undefined, onProgress);

    expect(onProgress.mock.calls.map(([event]) => [event.sequence, event.phase])).toEqual([
      [1, "model_step"], [2, "persisted"],
    ]);
    expect(result.answer).toBe('{"actions":[],"done":true,"message":"Saved"}');
    expect(onText).toHaveBeenLastCalledWith(result.answer);
    expect(result.answer).not.toContain("not an answer");
  });
});
