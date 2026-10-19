import { describe, expect, it } from "vitest";
import { getKnownContent, getKnownRevision, rememberRealtimeRevision, rememberRevision } from "@/app/workspace/hooks/workspaceBoardRevision";

describe("Document revision and REST merge ancestors", () => {
  it("does not attach a later unsaved UI snapshot to a realtime persistence receipt", () => {
    const board = { id: "receipt-ancestor", revision: 1, blocks: { doc: { html: "saved" } }, blockOrder: ["doc"], connectors: {} };
    rememberRevision(board);
    expect(getKnownContent(board.id)?.blocks).toEqual(board.blocks);
    rememberRealtimeRevision(board.id, 2);
    expect(getKnownRevision(board.id)).toBe(2);
    expect(getKnownContent(board.id)).toBeUndefined();
    rememberRevision({ ...board, revision: 2, blocks: { doc: { html: "persisted later" } } });
    expect(getKnownContent(board.id)?.blocks).toEqual({ doc: { html: "persisted later" } });
  });

  it("retains a real merge ancestor when receipts are stale or malformed", () => {
    const board = { id: "stale-receipt-ancestor", revision: 5, blocks: {}, blockOrder: [], connectors: {} };
    rememberRevision(board);
    for (const revision of [4, 5, NaN, 5.5]) rememberRealtimeRevision(board.id, revision);
    expect(getKnownRevision(board.id)).toBe(5);
    expect(getKnownContent(board.id)).toEqual({ blocks: {}, blockOrder: [], connectors: {} });
    rememberRevision({ ...board, revision: 4, blocks: { stale: {} } });
    expect(getKnownContent(board.id)?.blocks).toEqual({});
  });
});
