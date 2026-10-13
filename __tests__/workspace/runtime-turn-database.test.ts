import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { beginWorkspaceTurn, cancelWorkspaceTurn, completeWorkspaceTurn, isWorkspaceTurnCancelled, lockActiveWorkspaceTurn, WorkspaceTurnNotActiveError } from "@/lib/workspace-agent/turnStore";
import { appendWorkspaceTurnProgress } from "@/lib/workspace-agent/progressStore";
import { commitBoardContent } from "@/lib/workspace/boardCommit";
import { randomUUID } from "node:crypto";
const enabled = process.env.WORKSPACE_RUNTIME_TEST_DB === "1";
const boardId = randomUUID();
const actorEmail = "runtime-turn-test@example.invalid";
const payload = { query: "rename A to B", modelSelector: "openai/gpt-5.6-luna", context: "selected A" };
const key = (turnId: string) => ({ boardId, actorEmail, turnId });
describe.skipIf(!enabled)("real database turn lifecycle", () => {
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.startsWith("/workspace_runtime_test_")) throw new Error("Only isolated test database allowed");
    await prisma.workspaceBoard.create({ data: { id: boardId, ownerEmail: actorEmail, title: "Turn test", blocks: {}, blockOrder: [], connectors: {}, camera: {} } });
  });
  afterAll(async () => { await prisma.workspaceBoard.delete({ where: { id: boardId } }); await prisma.$disconnect(); });
  it("permits one runner and replays exact completed result after reconnect", async () => {
    const outcomes = await Promise.all([beginWorkspaceTurn(key("parallel"), payload), beginWorkspaceTurn(key("parallel"), payload)]);
    expect(outcomes.map(x => x.kind).sort()).toEqual(["running", "started"]);
    const response = { answer: "saved", receipts: [{ persisted: true, requestId: "parallel:1" }] };
    expect(await completeWorkspaceTurn(key("parallel"), response)).toBe(true);
    await prisma.$disconnect();
    expect(await beginWorkspaceTurn(key("parallel"), payload)).toEqual({ kind: "replay", response });
    expect(await beginWorkspaceTurn(key("parallel"), { ...payload, query: "different" })).toEqual({ kind: "payload_conflict" });
    expect(await beginWorkspaceTurn({ ...key("parallel"), actorEmail: "other@example.invalid" }, payload)).toEqual({ kind: "started" });
  });
  it("cancellation before callback creates a tombstone and prevents execution", async () => {
    expect(await cancelWorkspaceTurn(key("before-start"))).toBe("requested");
    expect(await beginWorkspaceTurn(key("before-start"), payload)).toEqual({ kind: "cancelled" });
    expect(await isWorkspaceTurnCancelled(key("before-start"))).toBe(true);
  });
  it("cancels running turns and retains their partial receipt response", async () => {
    await beginWorkspaceTurn(key("partial"), payload);
    await cancelWorkspaceTurn(key("partial"));
    expect(await isWorkspaceTurnCancelled(key("partial"))).toBe(true);
    await completeWorkspaceTurn(key("partial"), { answer: "partial", receipts: [{ persisted: true }] });
    expect(await cancelWorkspaceTurn(key("partial"))).toBe("completed");
  });
  it("recovers a stale crashed turn from its durable action receipt without rerunning it", async () => {
    const turnKey = key("crashed-after-commit");
    await beginWorkspaceTurn(turnKey, payload);
    const actionResponse = {
      revisionBefore: 0,
      revision: 1,
      actions: [{ type: "delete_frame", ids: ["frame-1"], summary: 'deleted frame "Acceptance frame"', changed: true }],
    };
    await prisma.$executeRaw`
      INSERT INTO workspace_command_receipts (board_id, actor_email, request_id, payload_hash, response)
      VALUES (${boardId}, ${actorEmail}, ${"crashed-after-commit:1"}, ${"test-hash"}, ${JSON.stringify(actionResponse)}::jsonb)
    `;
    await prisma.$executeRaw`
      UPDATE workspace_agent_turns SET updated_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes'
      WHERE board_id = ${boardId} AND actor_email = ${actorEmail} AND turn_id = ${turnKey.turnId}
    `;

    const recovered = await beginWorkspaceTurn(turnKey, payload);
    expect(recovered.kind).toBe("replay");
    if (recovered.kind !== "replay") throw new Error("stale turn was not recovered");
    expect(recovered.response.status).toBe("partial");
    expect(recovered.response.receipts).toEqual([expect.objectContaining({
      requestId: "crashed-after-commit:1",
      actionType: "delete_frame",
      targetIds: ["frame-1"],
      persisted: true,
      revisionAfter: 1,
      summary: 'delete_frame: deleted frame "Acceptance frame"',
    })]);
    expect(await beginWorkspaceTurn(turnKey, payload)).toEqual(recovered);
    expect(await beginWorkspaceTurn(turnKey, { ...payload, query: "different" })).toEqual({ kind: "payload_conflict" });
  });
  it("fences an old worker from committing after stale-turn recovery", async () => {
    const turnKey = key("fenced-crashed-worker");
    await beginWorkspaceTurn(turnKey, payload);
    await prisma.$executeRaw`
      UPDATE workspace_agent_turns SET updated_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes'
      WHERE board_id = ${boardId} AND actor_email = ${actorEmail} AND turn_id = ${turnKey.turnId}
    `;
    expect((await beginWorkspaceTurn(turnKey, payload)).kind).toBe("replay");
    expect(await isWorkspaceTurnCancelled(turnKey)).toBe(true);

    const board = await prisma.workspaceBoard.findUniqueOrThrow({ where: { id: boardId } });
    await expect(commitBoardContent({
      boardId, actorEmail, existing: board, baseRevision: board.revision,
      content: { title: "Must not commit", blocks: board.blocks as never, blockOrder: board.blockOrder as never, connectors: board.connectors as never, camera: board.camera as never },
      editEvents: [], skipAutoCheckpoint: true,
      beforeBoardCommit: async (tx) => {
        if (!await lockActiveWorkspaceTurn(tx, turnKey)) throw new WorkspaceTurnNotActiveError();
      },
    })).rejects.toBeInstanceOf(WorkspaceTurnNotActiveError);
    expect(await prisma.workspaceBoard.findUnique({ where: { id: boardId } })).toMatchObject({ title: "Turn test", revision: 0 });
  });
  it("refreshes the lease heartbeat on progress and does not reclaim an active turn", async () => {
    const turnKey = key("active-heartbeat");
    await beginWorkspaceTurn(turnKey, payload);
    await prisma.$executeRaw`
      UPDATE workspace_agent_turns SET updated_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes'
      WHERE board_id = ${boardId} AND actor_email = ${actorEmail} AND turn_id = ${turnKey.turnId}
    `;
    await appendWorkspaceTurnProgress(turnKey, { phase: "model_step", round: 1 });
    expect(await beginWorkspaceTurn(turnKey, payload)).toEqual({ kind: "running" });
  });
});
