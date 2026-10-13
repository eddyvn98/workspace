import { afterEach, describe, expect, it, vi } from "vitest";
import { watchWorkspaceTurnCancellation } from "@/lib/workspace-agent/cancellationWatch";

describe("Workspace runtime cancellation watch", () => {
  afterEach(() => vi.useRealTimers());

  it("aborts a pending provider turn after the stored cancellation flag changes", async () => {
    vi.useFakeTimers();
    const request = new AbortController();
    const isCancelled = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const abortProvider = vi.fn(() => request.abort(new Error("Workspace turn cancelled")));
    const stop = watchWorkspaceTurnCancellation(isCancelled, abortProvider, 10);

    await vi.advanceTimersByTimeAsync(20);

    expect(isCancelled).toHaveBeenCalledTimes(2);
    expect(abortProvider).toHaveBeenCalledOnce();
    expect(request.signal.aborted).toBe(true);
    stop();
  });

  it("keeps polling until the caller cleans up, even after the provider is aborted", async () => {
    vi.useFakeTimers();
    const request = new AbortController();
    const isCancelled = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const stop = watchWorkspaceTurnCancellation(isCancelled, () => request.abort(), 10);

    await vi.advanceTimersByTimeAsync(20);

    expect(isCancelled).toHaveBeenCalledTimes(2);
    expect(request.signal.aborted).toBe(true);
    stop();
  });
});
