import type { WorkspaceTurnProgressEvent } from "./contracts";

/** Merge committed runtime status with Dify's final answer without another model call. */
export function mergeWorkspaceProgressStream(
  upstream: ReadableStream<Uint8Array>,
  readProgress: (afterSequence: number) => Promise<WorkspaceTurnProgressEvent[]>,
  signal?: AbortSignal,
  pollIntervalMs = 750,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const encoder = new TextEncoder();
  let stopped = false;
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    wake?.();
    signal?.removeEventListener("abort", abort);
  };
  const abort = () => { stop(); void reader.cancel().catch(() => undefined); };
  const pause = () => new Promise<void>((resolve) => {
    wake = resolve;
    timer = setTimeout(resolve, pollIntervalMs);
  });
  return new ReadableStream({
    async start(controller) {
      if (signal?.aborted) { stop(); await reader.cancel(); controller.close(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      const emitProgress = async () => {
        const events = await readProgress(sequence);
        if (stopped) return;
        for (const value of events) {
          if (!Number.isSafeInteger(value.sequence) || value.sequence <= sequence) continue;
          if (!["model_step", "executing", "persisted", "completed"].includes(value.phase)) continue;
          const safe: Record<string, unknown> = { event: "workspace_runtime_progress", sequence: value.sequence, phase: value.phase };
          for (const key of ["round", "persistedCount", "revision"] as const) {
            if (Number.isSafeInteger(value[key]) && value[key]! >= 0) safe[key] = value[key];
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(safe)}\n\n`));
          sequence = value.sequence;
        }
      };
      const poll = async () => {
        while (!stopped) {
          try { await emitProgress(); } catch { /* Status is optional; Dify's final response remains available. */ }
          if (!stopped) await pause();
        }
      };
      const polling = poll();
      try {
        while (!stopped) {
          const chunk = await reader.read();
          if (stopped) break;
          if (chunk.done) {
            try { await emitProgress(); } catch { /* Preserve the final answer if status storage is unavailable. */ }
            break;
          }
          controller.enqueue(chunk.value);
        }
        stop();
        controller.close();
      } catch (error) {
        const wasStopped = stopped;
        stop();
        if (!wasStopped) controller.error(error);
      } finally {
        stop();
        await polling;
      }
    },
    cancel(reason) { stop(); return reader.cancel(reason); },
  });
}
