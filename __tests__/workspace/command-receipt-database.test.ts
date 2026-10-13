// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { commitBoardContent } from "@/lib/workspace/boardCommit";
import { commandReceiptKey, readCommandReceipt, writeCommandReceipt } from "@/lib/workspace/commandReceipts";

vi.mock("@/lib/workspace/knowledge-block-chunks", () => ({ syncBlockChunksFromBoard: vi.fn() }));

const enabled = process.env.WORKSPACE_RUNTIME_TEST_DB === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.startsWith("/workspace_runtime_test_")) {
  throw new Error("Receipt integration tests require an isolated workspace_runtime_test_ database");
}

describe.skipIf(!enabled)("durable Workspace command receipts", () => {
  const ids: string[] = [];
  const email = "runtime-test@example.test";
  async function fixture() {
    const id = randomUUID(); ids.push(id);
    return prisma.workspaceBoard.create({ data: { id, ownerEmail: email, title: "Receipt test", blocks: {}, blockOrder: [], connectors: {}, camera: {} } });
  }
  afterAll(async () => {
    await prisma.workspaceBoard.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("keeps the committed receipt across reconnection and refuses a reused id with different intent", async () => {
    const board = await fixture();
    const body = { requestId: "turn-1:0", baseRevision: board.revision, actions: [{ type: "rename_board", title: "Changed" }] };
    const key = commandReceiptKey(board.id, email, body)!;
    const outcome = await commitBoardContent({
      boardId: board.id, actorEmail: email, existing: board, baseRevision: board.revision,
      content: { title: "Changed", blocks: {}, blockOrder: [], connectors: {}, camera: {} },
      editEvents: [], skipAutoCheckpoint: true,
      writeCommandReceipt: (tx, committed) => writeCommandReceipt(tx, key, { revision: committed.revision, persisted: true }),
    });
    expect(outcome).toHaveProperty("board.revision", board.revision + 1);
    await prisma.$disconnect();
    expect(await readCommandReceipt(key)).toEqual({ kind: "replay", response: { revision: board.revision + 1, persisted: true } });
    const changedKey = commandReceiptKey(board.id, email, { ...body, actions: [{ type: "rename_board", title: "Other" }] })!;
    expect(await readCommandReceipt(changedKey)).toEqual({ kind: "conflict" });
    expect(await readCommandReceipt({ ...key, actorEmail: "other@example.test" })).toEqual({ kind: "missing" });
  });

  it("rolls back the board update when receipt persistence fails", async () => {
    const board = await fixture();
    await expect(commitBoardContent({
      boardId: board.id, actorEmail: email, existing: board, baseRevision: board.revision,
      content: { title: "Must roll back", blocks: {}, blockOrder: [], connectors: {}, camera: {} },
      editEvents: [], skipAutoCheckpoint: true,
      writeCommandReceipt: async () => { throw new Error("receipt write failed"); },
    })).rejects.toThrow("receipt write failed");
    expect(await prisma.workspaceBoard.findUnique({ where: { id: board.id } })).toMatchObject({ title: board.title, revision: board.revision });
  });

  it("commits one winner and one receipt when two commands race on the same revision", async () => {
    const board = await fixture();
    const calls = ["first", "second"].map(requestId => {
      const key = commandReceiptKey(board.id, email, { requestId, baseRevision: board.revision, title: requestId })!;
      return commitBoardContent({
        boardId: board.id, actorEmail: email, existing: board, baseRevision: board.revision,
        content: { title: requestId, blocks: {}, blockOrder: [], connectors: {}, camera: {} },
        editEvents: [], skipAutoCheckpoint: true,
        writeCommandReceipt: (tx, committed) => writeCommandReceipt(tx, key, { revision: committed.revision }),
      });
    });
    const results = await Promise.all(calls);
    expect(results.filter(result => "board" in result)).toHaveLength(1);
    expect(results.filter(result => "stale" in result)).toHaveLength(1);
    const saved = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM workspace_command_receipts WHERE board_id = ${board.id}`;
    expect(Number(saved[0].count)).toBe(1);
  });
});
