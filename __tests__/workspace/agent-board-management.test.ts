import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  board: { findUnique: vi.fn(), update: vi.fn() },
  workspaceBoardSnapshot: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  workspaceBoardShare: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  commit: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { workspaceBoard: db.board, workspaceBoardSnapshot: db.workspaceBoardSnapshot, workspaceBoardShare: db.workspaceBoardShare },
}));
vi.mock("@/lib/workspace/boardCommit", () => ({ commitBoardContent: db.commit }));
vi.mock("@/lib/workspace/ws-repository-notify", () => ({
  notifyWorkspaceAgentMutation: vi.fn(),
  diffRecordMap: () => ({ upsert: {}, removeIds: [] }),
  workspaceRealtimeDeliveryConfigured: () => false,
  postWorkspaceAgentPatch: vi.fn(),
}));
vi.mock("@/lib/workspace/ws-access-notify", () => ({ notifyWorkspaceAccessChanged: vi.fn() }));
vi.mock("@/app/api/workspaces/_notify", () => ({ notifyUser: vi.fn() }));

import { handleBoardActions } from "@/app/api/workspaces/[id]/agent/boardAction";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";

const block = (id: string, text: string, y: number, parentId?: string) => ({
  id, type: "text", parentId, data: { markdown: text },
  transform: { computed: null, override: { x: 0, y, w: 170, h: 36, rotation: 0, zIndex: 1 } },
});
const full = {
  id: "b1", title: "Plan", ownerEmail: "owner@x.com", revision: 4, camera: {},
  blocks: { a: block("a", "Root", 0), c: block("c", "Child", 80, "a") },
  blockOrder: ["a", "c"], connectors: {},
};
const lite = { id: "b1", title: "Plan", blocks: full.blocks, revision: 4 };
const run = (actions: any[], role: "OWNER" | "EDITOR" | "VIEWER" = "OWNER") => handleBoardActions(lite, "owner@x.com", actions, role);

describe("AI board management commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.board.findUnique.mockResolvedValue(full);
    db.workspaceBoardSnapshot.findFirst.mockResolvedValue(null);
    db.workspaceBoardShare.findMany.mockResolvedValue([]);
    db.commit.mockImplementation(async ({ content }) => ({ board: { ...full, ...content, revision: 5 } }));
  });

  it("returns null for batches without board commands", async () => {
    expect(await run([{ type: "update_style" }])).toBeNull();
  });

  it("lists and creates versions", async () => {
    db.workspaceBoardSnapshot.findMany.mockResolvedValue([{ id: "s1", label: "v1" }]);
    db.workspaceBoardSnapshot.create.mockResolvedValue({ id: "s2", label: "Draft" });
    const res = await run([{ type: "list_versions" }, { type: "create_version", params: { label: " Draft " } }], "EDITOR");
    expect(await res!.json()).toMatchObject({ ok: true, actions: [{ type: "list_versions", ids: ["s1"], changed: false }, { type: "create_version", ids: ["s2"], changed: true }], revision: 4 });
    expect(db.workspaceBoardSnapshot.create.mock.calls[0][0].data).toMatchObject({ label: "Draft", createdBy: "owner@x.com" });
  });

  it("rejects viewers for create, restore, import and share", async () => {
    const cmds = [
      { type: "create_version" },
      { type: "restore_version", snapshotId: "s1", baseRevision: 4, confirm: true },
      { type: "import_markdown", markdown: "- a", baseRevision: 4 },
      { type: "share_board", email: "a@x.com", role: "VIEWER", confirm: true },
    ];
    for (const cmd of cmds) expect((await run([cmd], "VIEWER"))!.status).toBe(403);
    expect(db.commit).not.toHaveBeenCalled();
    expect(db.workspaceBoardSnapshot.create).not.toHaveBeenCalled();
  });

  it("rejects non-owners for every share command", async () => {
    for (const cmd of [{ type: "list_shares" }, { type: "share_board", email: "a@x.com", role: "VIEWER", confirm: true }, { type: "remove_share", email: "a@x.com", confirm: true }, { type: "set_public_link", enabled: true, confirm: true }]) {
      const res = await run([cmd], "EDITOR");
      expect(res!.status).toBe(403);
      expect((await res!.json()).reason).toBe("owner_only");
    }
    expect(db.workspaceBoardShare.upsert).not.toHaveBeenCalled();
  });

  it("mints a fresh token when the existing public link has expired and no expiry is given", async () => {
    db.board.findUnique.mockResolvedValue({ ...full, publicShareEnabled: true, publicShareToken: "old-token", publicShareExpiresAt: new Date(Date.now() - 60_000) });
    db.board.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...full, publicShareEnabled: true, ...data }));
    const res = await run([{ type: "set_public_link", enabled: true, confirm: true }]);
    expect(res!.status).toBe(200);
    const data = db.board.update.mock.calls[0][0].data;
    expect(data.publicShareToken).toBeTruthy();
    expect(data.publicShareToken).not.toBe("old-token");
    expect(new Date(data.publicShareExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("requires confirm for restore and sharing commands", async () => {
    for (const cmd of [{ type: "restore_version", snapshotId: "s1", baseRevision: 4 }, { type: "share_board", email: "a@x.com", role: "EDITOR" }, { type: "remove_share", email: "a@x.com" }, { type: "set_public_link", enabled: false }]) {
      const res = await run([cmd]);
      expect(res!.status).toBe(400);
      expect((await res!.json()).reason).toBe("confirmation_required");
    }
  });

  it("restores a snapshot, and rejects a stale baseRevision with 409", async () => {
    db.workspaceBoardSnapshot.findUnique.mockResolvedValue({ id: "s1", boardId: "b1", blocks: {}, blockOrder: [], connectors: {} });
    const stale = await run([{ type: "restore_version", snapshotId: "s1", baseRevision: 3, confirm: true }]);
    expect(stale!.status).toBe(409);
    expect((await stale!.json()).reason).toBe("stale");
    expect(db.commit).not.toHaveBeenCalled();
    const ok = await run([{ type: "restore_version", snapshotId: "s1", baseRevision: 4, confirm: true }]);
    expect(await ok!.json()).toMatchObject({ ok: true, revision: 5, actions: [{ type: "restore_version", ids: ["s1"], changed: true }] });
    expect(db.commit.mock.calls[0][0]).toMatchObject({ baseRevision: 4, skipAutoCheckpoint: true });
  });

  it("rejects a snapshot from another board", async () => {
    db.workspaceBoardSnapshot.findUnique.mockResolvedValue({ id: "s1", boardId: "other" });
    expect((await run([{ type: "restore_version", snapshotId: "s1", baseRevision: 4, confirm: true }]))!.status).toBe(404);
  });

  it("round-trips markdown export through import_markdown below existing content", async () => {
    const exported = await (await run([{ type: "export_board", format: "markdown" }]))!.json();
    expect(exported.result.export).toMatchObject({ format: "markdown", blockCount: 2 });
    const res = await run([{ type: "import_markdown", markdown: exported.result.export.content, baseRevision: 4 }], "EDITOR");
    const body = await res!.json();
    expect(body.result.created).toHaveLength(2);
    const content = db.commit.mock.calls[0][0].content;
    const texts = body.result.created.map((id: string) => content.blocks[id].data.markdown);
    expect(texts).toEqual(["Root", "Child"]);
    for (const id of body.result.created) {
      expect(id in full.blocks).toBe(false);
      expect(content.blocks[id].transform.override.y).toBeGreaterThanOrEqual(116 + 48);
    }
    expect(Object.keys(content.blocks)).toHaveLength(4);
    expect(content.blockOrder.slice(0, 2)).toEqual(["a", "c"]);
  });

  it("exports json and opml, validating format and block ids", async () => {
    const json = await (await run([{ type: "export_board", params: { format: "json", blockIds: ["a"] } }]))!.json();
    expect(JSON.parse(json.result.export.content)).toMatchObject({ version: 1, blockOrder: ["a"] });
    const opml = await (await run([{ type: "export_board", format: "opml" }]))!.json();
    expect(opml.result.export.content).toContain("<opml");
    expect((await run([{ type: "export_board", format: "zip" }]))!.status).toBe(400);
    expect((await run([{ type: "export_board", format: "json", blockIds: ["zzz"] }]))!.status).toBe(422);
  });

  it.each(["pptx", "pdf"])("AI exports slide decks to %s without mutating the board", async (format) => {
    db.board.findUnique.mockResolvedValue({ ...full, blocks: { d: { type: "slideDeck", data: { slideOrder: ["s"], slides: { s: { id: "s", name: "Summary", html: "<h2>Report</h2>" } } } } }, blockOrder: ["d"] });
    const response = await run([{ type: "export_board", params: { format, blockIds: ["d"] } }], "VIEWER");
    const body = await response!.json();
    expect(response!.status).toBe(200);
    expect(body.result.export).toMatchObject({ format, slideCount: 1, downloadUrl: `/api/workspaces/b1/export?format=${format}&blockIds=%5B%22d%22%5D` });
    expect(body.result.export.byteLength).toBeGreaterThan(100);
    expect(body.actions[0].changed).toBe(false); expect(db.commit).not.toHaveBeenCalled();
  });

  it("shares with validation: self-share, bad role and success", async () => {
    expect((await run([{ type: "share_board", email: "OWNER@x.com", role: "EDITOR", confirm: true }]))!.status).toBe(400);
    expect((await run([{ type: "share_board", email: "a@x.com", role: "OWNER", confirm: true }]))!.status).toBe(400);
    db.workspaceBoardShare.findUnique.mockResolvedValue(null);
    db.workspaceBoardShare.upsert.mockResolvedValue({ invitedEmail: "a@x.com", role: "EDITOR" });
    const res = await run([{ type: "share_board", email: "A@x.com", role: "EDITOR", confirm: true }]);
    expect(await res!.json()).toMatchObject({ ok: true, result: { share: { email: "a@x.com", role: "EDITOR" } } });
  });

  it("refuses to mix board commands with board edits", async () => {
    const res = await run([{ type: "list_versions" }, { type: "update_style" }]);
    expect(res!.status).toBe(400);
    expect((await res!.json()).reason).toBe("mixed_batch");
  });
});

describe("board management proposal schemas", () => {
  const proposal = (action: Record<string, unknown>) => JSON.stringify({
    done: false, message: "Applying the requested change.", actions: [action],
  });

  it.each([
    { type: "list_versions" },
    { type: "create_version", label: "Before update" },
    { type: "export_board", format: "markdown", blockIds: ["block-1"] },
    { type: "import_markdown", markdown: "# Topic", baseRevision: 4 },
    { type: "list_shares" },
    { type: "restore_version", snapshotId: "snapshot-1", baseRevision: 4, confirm: true },
    { type: "share_board", email: "person@example.com", role: "VIEWER", confirm: true },
    { type: "remove_share", email: "person@example.com", confirm: true },
    { type: "set_public_link", enabled: true, expiration: "7d", confirm: true },
    { type: "set_public_link", enabled: true, expiration: null, confirm: true },
  ])("accepts valid $type proposal without a blockId", (action) => {
    expect(parseWorkspaceModelProposal(proposal(action)).actions).toEqual([action]);
  });

  it.each([
    [{ type: "export_board", format: "csv" }, /format/],
    [{ type: "import_markdown", markdown: "# Topic", baseRevision: 4, other: true }, /unsupported fields/],
    [{ type: "restore_version", snapshotId: "snapshot-1", baseRevision: 4 }, /confirm/],
    [{ type: "restore_version", snapshotId: "snapshot-1", baseRevision: 4.5, confirm: true }, /baseRevision/],
    [{ type: "share_board", email: "person@example.com", role: "OWNER", confirm: true }, /role/],
    [{ type: "share_board", email: "person@example.com", role: "EDITOR", confirm: false }, /confirm/],
    [{ type: "remove_share", email: "person@example.com", confirm: true, extra: "no" }, /unsupported fields/],
  ])("rejects invalid board management proposal", (action, issue) => {
    expect(() => parseWorkspaceModelProposal(proposal(action))).toThrow(issue);
  });

  it("continues to require an exact blockId for block commands", () => {
    expect(() => parseWorkspaceModelProposal(proposal({ type: "update_style", style: { bold: true } })))
      .toThrow(/blockId/);
  });
});
