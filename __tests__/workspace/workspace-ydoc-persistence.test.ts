import * as Y from "yjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPersistenceAwaiter } from "@/lib/workspace/ydoc-persistence";

describe("createPersistenceAwaiter", () => {
  afterEach(() => vi.useRealTimers());

  it("remembers an eligible server ack that arrives before Save is clicked", async () => {
    vi.useFakeTimers();
    const doc = new Y.Doc();
    const meta = doc.getMap("meta");
    const awaiter = createPersistenceAwaiter(meta);
    awaiter.markPending();
    await vi.advanceTimersByTimeAsync(2100);

    doc.transact(() => meta.set("boardRevision", 2), "remote");

    await expect(awaiter.awaitPersisted()).resolves.toBe(true);
    awaiter.destroy();
    doc.destroy();
  });

  it("waits for an ack while saving and resets confirmation for a new edit", async () => {
    vi.useFakeTimers();
    const doc = new Y.Doc();
    const meta = doc.getMap("meta");
    const awaiter = createPersistenceAwaiter(meta);
    awaiter.markPending();
    const firstSave = awaiter.awaitPersisted();
    await vi.advanceTimersByTimeAsync(2100);
    doc.transact(() => meta.set("boardRevision", 2), "remote");
    await expect(firstSave).resolves.toBe(true);

    awaiter.markPending();
    const secondSave = awaiter.awaitPersisted(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(secondSave).resolves.toBe(false);
    awaiter.destroy();
    doc.destroy();
  });
});
