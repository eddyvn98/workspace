import { SHEET_LIMITS } from "./limits";
import type { WorkbookTask, WorkbookResult } from "./workerTypes";
/** One disposable worker per operation. Cancellation/unmount/timeout all terminate
 * parsing instead of letting an abandoned job mutate a different workbook. */
export function runWorkbookTask(task: WorkbookTask, signal?: AbortSignal): Promise<WorkbookResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Workbook operation cancelled.")); return; }
    const worker = new Worker(new URL("./spreadsheet.worker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (error?: Error, result?: WorkbookResult) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel); worker.terminate();
      if (error) reject(error); else if (result) resolve(result); else reject(new Error("Invalid workbook worker response."));
    };
    const cancel = () => finish(new Error("Workbook operation cancelled."));
    const timer = setTimeout(() => finish(new Error("Workbook processing exceeded 30 seconds. Use a smaller file.")), SHEET_LIMITS.workerMs);
    signal?.addEventListener("abort", cancel, { once: true });
    worker.onmessage = ({ data }: MessageEvent<{ ok: boolean; result?: WorkbookResult; error?: string }>) => {
      finish(data.ok ? undefined : new Error(data.error || "Unable to process workbook."), data.result);
    };
    worker.onmessageerror = () => finish(new Error("Invalid spreadsheet worker response."));
    worker.onerror = () => finish(new Error("Spreadsheet file worker failed to load or process this file."));
    try { worker.postMessage(task); } catch (error) { finish(error instanceof Error ? error : new Error("Unable to start spreadsheet worker.")); }
  });
}
