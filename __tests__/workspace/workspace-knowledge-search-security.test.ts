import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), read: vi.fn(), search: vi.fn(), hybrid: vi.fn(), filenames: vi.fn(), graph: vi.fn(),
}));
vi.mock("@/app/api/workspaces/_auth", () => ({ resolveWorkspaceCallerAuth: mocks.auth }));
vi.mock("@/lib/workspace/knowledge-repository", async (original) => {
  const actual = await original<typeof import("@/lib/workspace/knowledge-repository")>();
  return { ...actual, requireBoardRead: mocks.read };
});
vi.mock("@/lib/workspace/knowledge-search", () => ({
  searchKnowledge: mocks.search, hybridSearchKnowledge: mocks.hybrid, withDocumentFilenames: mocks.filenames,
}));
vi.mock("@/lib/workspace/canvas-graph-repository", () => ({ buildGraphForHits: mocks.graph }));
import { POST } from "@/app/api/workspaces/[id]/knowledge/search/route";
import { WorkspaceAccessError } from "@/lib/workspace/knowledge-repository";

const request = (body: unknown = { query: "budget" }) =>
  new NextRequest("http://localhost/api/workspaces/private/knowledge/search", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });
const context = { params: { id: "private" } };

describe("Workspace knowledge search privacy boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ ok: true, email: "viewer@example.test" });
    mocks.search.mockResolvedValue([]);
    mocks.hybrid.mockResolvedValue([]);
    mocks.filenames.mockResolvedValue([]);
    mocks.graph.mockResolvedValue({ nodes: [], edges: [] });
  });
  it("does not execute search before a board access grant", async () => {
    mocks.read.mockRejectedValue(new WorkspaceAccessError("NOT_FOUND", "Board not found"));
    const response = await POST(request(), context);
    expect(response.status).toBe(404);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.hybrid).not.toHaveBeenCalled();
  });
  it("masks unexpected database errors from both browser and agent clients", async () => {
    mocks.read.mockRejectedValue(new Error("postgres://admin:secret@db.internal/private"));
    const response = await POST(request(), context);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain("Knowledge search unavailable");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("db.internal");
  });
  it("rejects invalid caller identity before any board read", async () => {
    mocks.auth.mockResolvedValue({ ok: false, status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    const response = await POST(request(), context);
    expect(response.status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("allows viewers to search only after a successful read check", async () => {
    mocks.read.mockResolvedValue(undefined);
    const response = await POST(request({ query: "budget", limit: 999 }), context);
    expect(response.status).toBe(200);
    expect(mocks.hybrid).toHaveBeenCalledWith("private", "budget", 50);
  });
});
