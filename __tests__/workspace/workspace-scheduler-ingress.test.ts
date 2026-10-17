import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/workspace/collectionScheduleRunner", () => ({ runCollectionScheduleBatch: mocks.run }));
import { POST } from "@/app/api/internal/workspace/collection-schedules/route";

const url = "http://localhost/api/internal/workspace/collection-schedules";
const request = (key?: string, data: unknown = { cursor: "", limit: 30 }) =>
  new NextRequest(url, { method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: "Bearer " + key } : {}) },
    body: JSON.stringify(data),
  });
const SECRET = "valid-workspace-cron-secret-32-characters-long";

describe("Workspace scheduler authenticated ingress", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("WORKSPACE_AUTOMATION_CRON_SECRET", SECRET);
    mocks.run.mockResolvedValue({ scanned: 1, boardsUpdated: 0, conflicted: 0,
      rulesExecuted: 0, recordsChanged: 0, nextCursor: null });
  });
  it("refuses unauthenticated and wrong-secret requests before scanning boards", async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("wrong-secret"))).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("rejects unsafe page size and malformed cursor", async () => {
    expect((await POST(request(SECRET, { limit: 101 }))).status).toBe(400);
    expect((await POST(request(SECRET, { cursor: 12 }))).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("paginates with a guarded server clock without accepting an actor identity", async () => {
    const response = await POST(request(SECRET, { cursor: "board-a", limit: 5, actorEmail: "admin@example.com" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.run).toHaveBeenCalledWith(expect.any(Date), "board-a", 5);
  });
  it("does not expose internal database errors to a cron client", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.run.mockRejectedValue(new Error("postgres://secret@internal-db"));
      const response = await POST(request(SECRET));
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("internal-db");
    } finally { spy.mockRestore(); }
  });
});
