// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { appendWorkspaceTurnProgress, readWorkspaceTurnProgress } from "@/lib/workspace-agent/progressStore";
import { beginWorkspaceTurn, workspaceAgentTurnPayloadHash } from "@/lib/workspace-agent/turnStore";

const enabled = process.env.WORKSPACE_RUNTIME_TEST_DB === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.startsWith("/workspace_runtime_test_")) {
  throw new Error("Progress integration tests require an isolated workspace_runtime_test_ database");
}

describe.skipIf(!enabled)("durable Workspace runtime progress", () => {
  const boardIds = [randomUUID(), randomUUID()];
  const actorEmail = "runtime-progress-test@example.invalid";
  const otherActorEmail = "runtime-progress-other@example.invalid";
  const turnId = "progress-turn";
  const key = (boardId: string, actor: string) => ({ boardId, actorEmail: actor, turnId });
  const payload = { query: "rename A to B", modelSelector: "deepseek-v4-flash" };

  beforeAll(async () => {
    for (const boardId of boardIds) {
      await prisma.workspaceBoard.create({
        data: { id: boardId, ownerEmail: actorEmail, title: "Progress test", blocks: {}, blockOrder: [], connectors: {}, camera: {} },
      });
    }
    await Promise.all([
      beginWorkspaceTurn(key(boardIds[0], actorEmail), payload),
      beginWorkspaceTurn(key(boardIds[0], otherActorEmail), payload),
      beginWorkspaceTurn(key(boardIds[1], actorEmail), payload),
    ]);
  });

  afterAll(async () => {
    await prisma.workspaceBoard.deleteMany({ where: { id: { in: boardIds } } });
    await prisma.$disconnect();
  });

  it("allocates monotonic sequences, supports cursors, and isolates turn keys", async () => {
    const primary = key(boardIds[0], actorEmail);
    const sequences = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      appendWorkspaceTurnProgress(primary, { phase: "model_step", round: index + 1 }),
    ));
    expect(sequences.map((event) => event?.sequence).sort((a, b) => Number(a) - Number(b))).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));

    const firstPage = await readWorkspaceTurnProgress(primary, 0);
    const afterCursor = await readWorkspaceTurnProgress(primary, 7);
    expect(firstPage.map((event) => event.sequence)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(afterCursor.map((event) => event.sequence)).toEqual([8, 9, 10, 11, 12]);
    expect(afterCursor.every((event) => event.sequence > 7)).toBe(true);
    expect(await readWorkspaceTurnProgress(primary, 0, workspaceAgentTurnPayloadHash({ ...payload, query: "different" }))).toEqual([]);

    await appendWorkspaceTurnProgress(key(boardIds[0], otherActorEmail), { phase: "executing", round: 1 });
    await appendWorkspaceTurnProgress(key(boardIds[1], actorEmail), { phase: "persisted", round: 1, persistedCount: 1, revision: 2 });
    expect(await readWorkspaceTurnProgress(key(boardIds[0], otherActorEmail))).toMatchObject([{ sequence: 1, phase: "executing" }]);
    expect(await readWorkspaceTurnProgress(key(boardIds[1], actorEmail))).toMatchObject([{ sequence: 1, phase: "persisted", revision: 2 }]);
    expect((await readWorkspaceTurnProgress(primary))).toHaveLength(12);
  });
});
