import { describe, expect, it, vi } from "vitest";
import { mergeWorkspaceProgressStream } from "@/lib/workspace-agent/progressStream";

describe("Workspace progress SSE", () => {
  it("delivers a committed status before Dify completes, then preserves its answer", async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { upstream = controller; } });
    const read = vi.fn().mockResolvedValue([{ sequence: 1, phase: "persisted", persistedCount: 2, revision: 8, token: "secret" }]);
    const reader = mergeWorkspaceProgressStream(body, read).getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('"event":"workspace_runtime_progress"');
    expect(first).toContain('"persistedCount":2');
    expect(first).not.toContain("secret");
    upstream.enqueue(new TextEncoder().encode('data: {"event":"message","answer":"Saved"}\n\n'));
    upstream.close();
    const next = new TextDecoder().decode((await reader.read()).value);
    expect(next).toContain("Saved");
    expect((await reader.read()).done).toBe(true);
  });

  it("stops polling when the browser disconnects", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const read = vi.fn().mockResolvedValue([{ sequence: 1, phase: "model_step", round: 1 }]);
    const reader = mergeWorkspaceProgressStream(body, read, undefined, 5).getReader();
    await reader.read();
    await reader.cancel();
    const calls = read.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 15));
    expect(read).toHaveBeenCalledTimes(calls);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps the final answer available when optional status storage fails", async () => {
    const body = new Response("Dify answer").body!;
    const stream = mergeWorkspaceProgressStream(body, async () => { throw new Error("database unavailable"); });
    expect(await new Response(stream).text()).toBe("Dify answer");
  });
});
