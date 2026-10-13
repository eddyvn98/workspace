import { afterEach, describe, expect, it, vi } from "vitest";
import { renameRemoteBoard } from "@/app/workspace/hooks/workspaceBoardApi";

const remote = {
  id: "b1",
  title: "Old",
  revision: 7,
  blocks: { a: { id: "a" } },
  blockOrder: ["a"],
  connectors: {},
  camera: { x: 1, y: 2, zoom: 1 },
  frames: [],
  updatedAt: new Date().toISOString(),
};

function mockFetch(putStatus: number, putBody: unknown = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (!init?.method || init.method === "GET") return new Response(JSON.stringify(remote), { status: 200 });
    return new Response(JSON.stringify(putBody), { status: putStatus });
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("renameRemoteBoard", () => {
  it("sends the server's own content and revision, changing only the title", async () => {
    const calls = mockFetch(200);
    const result = await renameRemoteBoard("b1", "New title");
    expect(result.ok).toBe(true);
    const put = calls.find((c) => c.init?.method === "PUT");
    const body = JSON.parse(String(put?.init?.body));
    expect(body.title).toBe("New title");
    expect(body.baseRevision).toBe(7);
    expect(body.blocks).toEqual(remote.blocks);
  });

  it("reports the server's refusal instead of swallowing it", async () => {
    mockFetch(409, { error: "This board changed since you loaded it" });
    const result = await renameRemoteBoard("b1", "New title");
    expect(result).toMatchObject({ ok: false, status: 409, error: "This board changed since you loaded it" });
  });

  it("reports a missing board with status 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(await renameRemoteBoard("gone", "x")).toMatchObject({ ok: false, status: 404 });
  });
});
