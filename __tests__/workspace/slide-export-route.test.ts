import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), board: vi.fn(), image: vi.fn(), commit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceBoard: { findUnique: mocks.board } } }));
vi.mock("@/lib/workspace/boardCommit", () => ({ commitBoardContent: mocks.commit }));
vi.mock("@/app/api/workspaces/_auth", () => ({ resolveWorkspaceCallerAuth: mocks.auth }));
vi.mock("@/app/api/workspaces/_access", () => ({ resolveAccessRole: mocks.access }));
vi.mock("@/lib/project-knowledge-storage", () => ({ readKnowledgeImage: mocks.image }));
import { GET } from "@/app/api/workspaces/[id]/export/route";

const board = { title: "Báo cáo", blocks: { d: { type: "slideDeck", data: { slideOrder: ["s"], slides: { s: { id: "s", name: "Slide", html: "<h2>Test</h2>" } } } } }, blockOrder: ["d"] };
const run = (query: string) => GET(new NextRequest(`https://workspace/api/workspaces/b/export?${query}`), { params: { id: "b" } });
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ ok: true, email: "owner@x" }); mocks.access.mockResolvedValue("OWNER"); mocks.board.mockResolvedValue(board); });
describe("Authenticated slide downloads", () => {
  it("rejects unauthenticated and unauthorized requests before export", async () => {
    mocks.auth.mockResolvedValue({ ok: false, message: "Unauthorized", status: 401 });
    expect((await run("format=pptx")).status).toBe(401); expect(mocks.board).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ ok: true, email: "other@x" }); mocks.access.mockResolvedValue(null);
    expect((await run("format=pdf")).status).toBe(404); expect(mocks.image).not.toHaveBeenCalled();
  });
  it.each(["pptx", "pdf"])("returns a private %s attachment for a viewer", async (format) => {
    mocks.access.mockResolvedValue("VIEWER");
    const response = await run(`format=${format}&blockIds=${encodeURIComponent('["d"]')}`);
    expect(response.status).toBe(200); expect(response.headers.get("content-disposition")).toContain(`workspace.${format}`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe(format === "pdf" ? "%PDF" : "PK\x03\x04");
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("fails malformed JSON, unknown block selections and missing uploads explicitly", async () => {
    expect((await run("format=pptx&blockIds=broken")).status).toBe(400);
    expect((await run(`format=pdf&blockIds=${encodeURIComponent('["missing"]')}`)).status).toBe(422);
    mocks.board.mockResolvedValue({ ...board, blocks: { d: { ...board.blocks.d, data: { ...board.blocks.d.data, slides: { s: { ...board.blocks.d.data.slides.s, html: '<img src="/api/workspace-images/ws_a"/>' } } } } } });
    mocks.image.mockResolvedValue(null);
    const response = await run("format=pptx"); expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("missing");
  });
});
