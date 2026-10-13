import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ bulk: vi.fn(), index: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/services/mongodb/client", () => ({ getMongoAiDb: vi.fn().mockResolvedValue({ collection: () => ({ bulkWrite: mocks.bulk, createIndex: mocks.index }) }) }));
import { insertUsageEvents } from "@/services/mongodb/aiUsageEvents.repo";
import type { AIUsageEventDoc } from "@/lib/ai-usage/server/usage-event.types";
describe("usage backfill race", () => {
  it("fills only missing measurements on duplicate realtime events, leaving token fields intact", async () => {
    mocks.bulk.mockResolvedValue({ upsertedCount: 0, upsertedIds: {}, modifiedCount: 1 });
    await insertUsageEvents([{ _id: "msg", source: "realtime", feature: "workspace-runtime-chat", workspaceTurnId: "turn", observedDurationMs: 321 } as AIUsageEventDoc]);
    const updates = mocks.bulk.mock.calls[1][0];
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual({ updateOne: { filter: { _id: "msg", observedDurationMs: { $exists: false } }, update: { $set: { observedDurationMs: 321, feature: "workspace-runtime-chat" } } } });
    expect(updates[1].updateOne.filter).toEqual({ _id: "msg", workspaceTurnId: { $exists: false } });
    expect(JSON.stringify(updates)).not.toContain("totalTokens");
    expect(JSON.stringify(updates)).not.toContain('"source"');
  });
});
