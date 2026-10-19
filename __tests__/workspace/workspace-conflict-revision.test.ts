import { afterEach, describe, expect, it, vi } from "vitest";
import { checkBoardAccess, getKnownContent, getKnownRevision, rememberRealtimeRevision, rememberRevision, saveRemoteBoard } from "@/app/workspace/hooks/workspaceBoardApi";

vi.mock("@/app/workspace/utils/workspaceDocumentCheckpoint", () => ({ workspaceDocumentCheckpoint: () => undefined }));
afterEach(() => vi.unstubAllGlobals());

describe("conflict lookup revision safety", () => {
  it("keeps the revision unknown across retries when no merge ancestor is available", async () => {
    const id = "no-common-ancestor";
    const board = { id, revision: 1, title: "Mine", blocks: {}, blockOrder: [], connectors: {}, camera: {} };
    rememberRevision(board);
    rememberRealtimeRevision(id, 2);
    expect(getKnownContent(id)).toBeUndefined();
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "PUT") {
        requests.push(JSON.parse(String(init.body)));
        return { ok: false, status: 409, json: async () => ({ reason: "stale", revision: 3 }) };
      }
      return { ok: true, status: 200, json: async () => ({ ...board, revision: 3, title: "Other editor" }) };
    }));
    expect(await saveRemoteBoard(id, board)).toMatchObject({ ok: false, conflict: true });
    expect(await checkBoardAccess(id, { remember: false })).toMatchObject({ status: "ok" });
    expect(getKnownRevision(id)).toBeUndefined();
    expect(getKnownContent(id)).toBeUndefined();
    expect(await saveRemoteBoard(id, board)).toMatchObject({ ok: false, conflict: true });
    expect(requests[0].baseRevision).toBe(2);
    expect(requests[1]).not.toHaveProperty("baseRevision");
  });

  it("still remembers the authoritative snapshot for ordinary board hydration", async () => {
    const board = { id: "hydration-snapshot", revision: 7, blocks: {}, blockOrder: [], connectors: {} };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => board })));
    await checkBoardAccess(board.id);
    expect(getKnownRevision(board.id)).toBe(7);
    expect(getKnownContent(board.id)).toEqual({ blocks: {}, blockOrder: [], connectors: {} });
  });
});
