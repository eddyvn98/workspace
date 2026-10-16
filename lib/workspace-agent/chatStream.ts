/** Allow only user-facing Dify messages and the authoritative final output. */
export function workspaceRuntimeChatStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let finished = false;
      const emit = (line: string) => {
        if (!line.startsWith("data:")) return;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") return;
        let event: Record<string, unknown>;
        try { event = JSON.parse(raw) as Record<string, unknown>; } catch { return; }
        const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
        if (event.event === "text_chunk" && typeof data.text === "string") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: "text_chunk", data: { text: data.text } })}\n\n`));
        }
        if (event.event === "workflow_finished" && typeof (data.outputs as Record<string, unknown> | undefined)?.answer === "string") {
          finished = true;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: "workflow_finished", data: { outputs: { answer: (data.outputs as Record<string, unknown>).answer } } })}\n\n`));
        }
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";
          for (const line of lines) emit(line);
          if (done) break;
        }
        if (buffer) emit(buffer);
        void finished;
        controller.close();
      } catch (error) { controller.error(error); }
      finally { reader.releaseLock(); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}
