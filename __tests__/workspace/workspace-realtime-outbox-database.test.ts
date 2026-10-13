// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { commitBoardContent } from "@/lib/workspace/boardCommit";
import { drainWorkspaceRealtimeOutbox, enqueueWorkspaceRealtimePatch } from "@/lib/workspace/realtimeOutbox";
import type { WorkspaceAgentPatch } from "@/lib/workspace/ws-repository-notify";

vi.mock("@/lib/workspace/knowledge-block-chunks", () => ({ syncBlockChunksFromBoard: vi.fn() }));

const enabled = process.env.WORKSPACE_RUNTIME_TEST_DB === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.startsWith("/workspace_runtime_test_")) {
  throw new Error("Realtime outbox integration tests require an isolated workspace_runtime_test_ database");
}

describe.skipIf(!enabled)("Workspace realtime outbox durability", () => {
  const boardIds: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.MINDMAP_WS_INTERNAL_URL;
  const originalSecret = process.env.MINDMAP_WS_TOKEN_SECRET;
  const actorEmail = "realtime-outbox-test@example.invalid";

  async function outboxEvent(boardId: string, revision: number) {
    const rows = await prisma.$queryRaw<Array<{ id: string; attempts: number; deliveredAt: Date | null; lastError: string | null }>>(Prisma.sql`
      SELECT "id", "attempts", "deliveredAt", "lastError"
      FROM "workspace_realtime_outbox" WHERE "boardId" = ${boardId} AND "revision" = ${revision}
    `);
    if (!rows[0]) throw new Error(`Missing outbox event ${boardId}@${revision}`);
    return rows[0];
  }

  async function outboxCount(boardId: string): Promise<number> {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count" FROM "workspace_realtime_outbox" WHERE "boardId" = ${boardId}
    `);
    return rows[0]?.count ?? 0;
  }

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.MINDMAP_WS_INTERNAL_URL;
    else process.env.MINDMAP_WS_INTERNAL_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.MINDMAP_WS_TOKEN_SECRET;
    else process.env.MINDMAP_WS_TOKEN_SECRET = originalSecret;
    await prisma.workspaceBoard.deleteMany({ where: { id: { in: boardIds } } });
    await prisma.$disconnect();
  });

  it("commits the patch with board state and retries failed HTTP delivery in revision order", async () => {
    const boardId = randomUUID();
    boardIds.push(boardId);
    const initial = await prisma.workspaceBoard.create({
      data: { id: boardId, ownerEmail: actorEmail, title: "Before", blocks: {}, blockOrder: [], connectors: {}, camera: {} },
    });
    const patch: WorkspaceAgentPatch = {
      upsertBlocks: { node: { id: "node", type: "text", title: "After" } },
      removeBlockIds: [], upsertConnectors: {}, removeConnectorIds: [], blockOrder: ["node"],
    };
    const outcome = await commitBoardContent({
      boardId, actorEmail, existing: initial, baseRevision: initial.revision, skipAutoCheckpoint: true,
      content: { title: "After", blocks: patch.upsertBlocks as never, blockOrder: ["node"], connectors: {}, camera: {} },
      editEvents: [],
      writeRealtimeOutbox: (tx, committed) => enqueueWorkspaceRealtimePatch(tx, { boardId, revision: committed.revision, patch }),
    });
    expect("board" in outcome && outcome.board.revision).toBe(1);
    expect(await outboxCount(boardId)).toBe(1);

    process.env.MINDMAP_WS_INTERNAL_URL = "http://realtime.invalid";
    process.env.MINDMAP_WS_TOKEN_SECRET = "test-secret";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as typeof fetch;

    expect(await drainWorkspaceRealtimeOutbox(10, boardId)).toMatchObject({ claimed: 1, delivered: 0 });
    let event = await outboxEvent(boardId, 1);
    expect(event).toMatchObject({ attempts: 1, deliveredAt: null, lastError: "HTTP 503" });
    await prisma.$executeRaw(Prisma.sql`UPDATE "workspace_realtime_outbox" SET "availableAt" = ${new Date(0)} WHERE "id" = ${event.id}`);

    await prisma.$transaction(async (tx) => {
      await enqueueWorkspaceRealtimePatch(tx, { boardId, revision: 2, patch });
      await enqueueWorkspaceRealtimePatch(tx, { boardId, revision: 3, patch });
    });
    const competingDrains = await Promise.all([
      drainWorkspaceRealtimeOutbox(10, boardId),
      drainWorkspaceRealtimeOutbox(10, boardId),
    ]);
    let laterDelivered = competingDrains.reduce((sum, result) => sum + result.delivered, 0);
    while (laterDelivered < 2) {
      laterDelivered += (await drainWorkspaceRealtimeOutbox(10, boardId)).delivered;
    }
    expect(laterDelivered).toBe(2);
    expect(await drainWorkspaceRealtimeOutbox(10, boardId)).toMatchObject({ claimed: 1, delivered: 1 });

    event = await outboxEvent(boardId, 1);
    expect(event.deliveredAt).toBeInstanceOf(Date);
    const deliveredRevisions = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).revision);
    expect(deliveredRevisions).toEqual([1, 1, 2, 3]);
  });

  it("rolls back board data when the outbox insert fails", async () => {
    const boardId = randomUUID();
    boardIds.push(boardId);
    const initial = await prisma.workspaceBoard.create({
      data: { id: boardId, ownerEmail: actorEmail, title: "Before", blocks: {}, blockOrder: [], connectors: {}, camera: {} },
    });
    await expect(commitBoardContent({
      boardId, actorEmail, existing: initial, baseRevision: initial.revision, skipAutoCheckpoint: true,
      content: { title: "Should roll back", blocks: {}, blockOrder: [], connectors: {}, camera: {} },
      editEvents: [],
      writeRealtimeOutbox: async () => { throw new Error("outbox insert failed"); },
    })).rejects.toThrow("outbox insert failed");
    const persisted = await prisma.workspaceBoard.findUniqueOrThrow({ where: { id: boardId } });
    expect(persisted).toMatchObject({ title: "Before", revision: 0 });
    expect(await outboxCount(boardId)).toBe(0);
  });
});
