import { describe, expect, it } from "vitest";
import { workspaceRuntimeChatStream } from "@/lib/workspace-agent/chatStream";
import { consumeWorkspaceChatResponse } from "@/app/workspace/utils/workspaceChatStream";

function makeSse(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
}

describe("Workspace runtime chat stream", () => {
  it("forwards text chunks and the authoritative workflow answer through the server allowlist", async () => {
    const upstream = makeSse([
      { event: "text_chunk", data: { text: "draft" }, secret: "strip" },
      { event: "workflow_finished", data: { outputs: { answer: "PDF pageCount=2 pinnedPage=2", secret: "strip" } } },
    ]);
    const response = new Response(workspaceRuntimeChatStream(upstream), {
      headers: { "Content-Type": "text/event-stream" },
    });
    const result = await consumeWorkspaceChatResponse(response, () => {});

    expect(result.answer).toBe("PDF pageCount=2 pinnedPage=2");
    expect(result.answer).not.toContain("draft");
  });

  it("preserves incremental text when Dify emits only text_chunk events", async () => {
    const response = new Response(workspaceRuntimeChatStream(makeSse([
      { event: "text_chunk", data: { text: "Đang xử lý" } },
    ])), { headers: { "Content-Type": "text/event-stream" } });

    await expect(consumeWorkspaceChatResponse(response, () => {})).resolves.toMatchObject({ answer: "Đang xử lý" });
  });
});
