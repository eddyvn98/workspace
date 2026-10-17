import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), role: vi.fn() }));
vi.mock("@/app/api/workspaces/_auth", () => ({ resolveWorkspaceCallerAuth: mocks.auth }));
vi.mock("@/app/api/workspaces/_access", () => ({ resolveAccessRole: mocks.role }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceBoard: { findUnique: mocks.find } } }));
import { GET } from "@/app/api/workspaces/[id]/revision/route";

const request = () => new NextRequest("http://localhost/api/workspaces/board-1/revision");
const context = { params: { id: "board-1" } };

describe("Collection revision notification authority", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ ok: true, email: "user@example.test" });
    mocks.find.mockResolvedValue({ id: "board-1", ownerEmail: "owner@example.test", revision: 12 });
    mocks.role.mockResolvedValue("VIEWER");
  });

  it("rejects unauthenticated callers before querying board metadata", async () => {
    mocks.auth.mockResolvedValue({ ok: false, status: 401, message: "Unauthorized" });
    expect((await GET(request(), context)).status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("hides board existence when user has no permission", async () => {
    mocks.role.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(404);
  });

  it("does not enumerate boards that have been removed", async () => {
    mocks.find.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.role).not.toHaveBeenCalled();
  });

  it("exposes only revision to an authorized viewer and disables caching", async () => {
    const result = await GET(request(), context);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ revision: 12 });
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.role).toHaveBeenCalledWith(
      { id: "board-1", ownerEmail: "owner@example.test", revision: 12 }, "user@example.test",
    );
  });
});
