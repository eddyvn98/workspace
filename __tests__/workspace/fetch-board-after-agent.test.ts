// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchRemoteBoard = vi.fn();
vi.mock("@/app/workspace/hooks/workspaceBoardApi", () => ({ fetchRemoteBoard: (...args: unknown[]) => fetchRemoteBoard(...args), rememberRevision: vi.fn() }));

import { fetchBoardAfterAgent } from "@/app/workspace/hooks/workspaceChatSendHelpers";

// The board only changes on the 10th poll, i.e. after the short wait gives up.
function lateChange(changeOnCall: number) {
  let call = 0;
  fetchRemoteBoard.mockImplementation(async () => ({ revision: ++call >= changeOnCall ? 2 : 1 }));
}

describe("fetchBoardAfterAgent", () => {
  beforeEach(() => { vi.useFakeTimers(); fetchRemoteBoard.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it("gives up after the short wait when no change is expected", async () => {
    lateChange(10);
    const run = fetchBoardAfterAgent("b", { revision: 1 } as never);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await run)?.revision).toBe(1);
  });

  it("keeps waiting for a write the reply claims to have made", async () => {
    lateChange(10);
    const run = fetchBoardAfterAgent("b", { revision: 1 } as never, { expectChange: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await run)?.revision).toBe(2);
  });
});
