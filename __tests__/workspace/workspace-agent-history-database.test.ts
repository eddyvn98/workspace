// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { commitBoardContent, type BoardContent, type BoardCommitOutcome } from "@/lib/workspace/boardCommit";
import { commandReceiptKey, readCommandReceipt, writeCommandReceipt } from "@/lib/workspace/commandReceipts";
import { prepareHistory, rememberChange } from "@/app/api/workspaces/[id]/agent/history";
import type { AgentBoardState } from "@/app/api/workspaces/[id]/agent/operationsCore";

vi.mock("@/lib/workspace/knowledge-block-chunks", () => ({ syncBlockChunksFromBoard: vi.fn() }));

const enabled = process.env.WORKSPACE_RUNTIME_TEST_DB === "1";
if (enabled && !new URL(process.env.DATABASE_URL!).pathname.startsWith("/workspace_runtime_test_")) {
  throw new Error("Agent history integration tests require an isolated workspace_runtime_test_ database");
}

describe.skipIf(!enabled)("durable Workspace agent history", () => {
  const boardIds: string[] = [];
  const actorEmail = "agent-history-test@example.invalid";

  const state = (markdown: string): AgentBoardState => ({
    title: "History board",
    blocks: { node: { id: "node", type: "text", data: { markdown } } },
    blockOrder: ["node"],
    connectors: {},
    frames: [],
    treeLayoutDirection: "right",
  });

  function content(value: AgentBoardState): BoardContent {
    return {
      title: value.title,
      blocks: value.blocks as never,
      blockOrder: value.blockOrder as never,
      connectors: value.connectors as never,
      camera: {} as never,
      frames: (value.frames ?? []) as never,
      treeLayoutDirection: value.treeLayoutDirection as string,
    };
  }

  function boardState(board: Awaited<ReturnType<typeof prisma.workspaceBoard.findUnique>>): AgentBoardState {
    if (!board) throw new Error("Test board missing");
    return {
      title: board.title,
      blocks: board.blocks as Record<string, never>,
      blockOrder: board.blockOrder as string[],
      connectors: board.connectors as Record<string, never>,
      frames: (board.frames ?? []) as never,
      treeLayoutDirection: board.treeLayoutDirection,
    };
  }

  async function fixture(initial = state("before")) {
    const id = randomUUID();
    boardIds.push(id);
    const board = await prisma.workspaceBoard.create({
      data: {
        id, ownerEmail: actorEmail, title: initial.title,
        blocks: initial.blocks as never, blockOrder: initial.blockOrder as never,
        connectors: initial.connectors as never, camera: {}, frames: [] as never,
        treeLayoutDirection: "right",
      },
    });
    return board;
  }

  async function commit(
    board: NonNullable<Awaited<ReturnType<typeof prisma.workspaceBoard.findUnique>>>,
    before: AgentBoardState,
    after: AgentBoardState,
    writeHistory: (tx: Prisma.TransactionClient) => Promise<void>,
    requestName: string,
  ): Promise<BoardCommitOutcome> {
    const receiptKey = commandReceiptKey(board.id, actorEmail, {
      requestId: `${board.id}:${requestName}`,
      baseRevision: board.revision,
      actions: [{ type: requestName }],
    })!;
    return commitBoardContent({
      boardId: board.id, actorEmail, existing: board, baseRevision: board.revision,
      content: content(after), editEvents: [], skipAutoCheckpoint: true,
      writeCommandReceipt: (tx, committed) => writeCommandReceipt(tx, receiptKey, { persisted: true, revision: committed.revision }),
      writeAgentHistory: writeHistory,
    });
  }

  afterAll(async () => {
    await prisma.workspaceBoard.deleteMany({ where: { id: { in: boardIds } } });
    await prisma.$disconnect();
  });

  it("survives reconnect and moves durable entries through undo and redo", async () => {
    const before = state("before"), after = state("after");
    const initialBoard = await fixture(before);
    const changed = await commit(initialBoard, before, after, (tx) => rememberChange(tx, initialBoard.id, before, after), "change");
    expect("board" in changed).toBe(true);

    await prisma.$disconnect();
    let current = await prisma.workspaceBoard.findUnique({ where: { id: initialBoard.id } });
    let prepared = await prepareHistory(initialBoard.id, "undo", boardState(current));
    expect(prepared?.snapshot.blocks).toMatchObject({ node: { data: { markdown: "before" } } });
    const undone = await commit(current!, boardState(current), prepared!.snapshot as AgentBoardState, prepared!.complete, "undo");
    expect("board" in undone).toBe(true);

    current = await prisma.workspaceBoard.findUnique({ where: { id: initialBoard.id } });
    prepared = await prepareHistory(initialBoard.id, "redo", boardState(current));
    expect(prepared?.snapshot.blocks).toMatchObject({ node: { data: { markdown: "after" } } });
    const redone = await commit(current!, boardState(current), prepared!.snapshot as AgentBoardState, prepared!.complete, "redo");
    expect("board" in redone).toBe(true);
    expect((await prisma.workspaceBoard.findUnique({ where: { id: initialBoard.id } }))?.blocks).toMatchObject({ node: { data: { markdown: "after" } } });
    expect(await prepareHistory(initialBoard.id, "redo", state("after"))).toBeNull();
  });

  it("rolls board, command receipt, and history back together when history persistence fails", async () => {
    const before = state("before"), after = state("after");
    const board = await fixture(before);
    const receiptKey = commandReceiptKey(board.id, actorEmail, {
      requestId: `${board.id}:failed`, baseRevision: board.revision, actions: [{ type: "change" }],
    })!;
    await expect(commitBoardContent({
      boardId: board.id, actorEmail, existing: board, baseRevision: board.revision,
      content: content(after), editEvents: [], skipAutoCheckpoint: true,
      writeCommandReceipt: (tx, committed) => writeCommandReceipt(tx, receiptKey, { revision: committed.revision }),
      writeAgentHistory: async (tx) => { await rememberChange(tx, board.id, before, after); throw new Error("history write failed"); },
    })).rejects.toThrow("history write failed");

    expect(await prisma.workspaceBoard.findUnique({ where: { id: board.id } })).toMatchObject({ revision: 0, title: "History board" });
    expect(await readCommandReceipt(receiptKey)).toEqual({ kind: "missing" });
    expect(await prepareHistory(board.id, "undo", before)).toBeNull();
  });

  it("allows only one concurrent undo at a board revision", async () => {
    const before = state("before"), after = state("after");
    const initialBoard = await fixture(before);
    await commit(initialBoard, before, after, (tx) => rememberChange(tx, initialBoard.id, before, after), "change");
    const current = await prisma.workspaceBoard.findUnique({ where: { id: initialBoard.id } });
    const currentState = boardState(current);
    const prepared = await Promise.all([
      prepareHistory(initialBoard.id, "undo", currentState),
      prepareHistory(initialBoard.id, "undo", currentState),
    ]);
    const outcomes = await Promise.all(prepared.map((entry, index) => commit(
      current!, currentState, entry!.snapshot as AgentBoardState, entry!.complete, `undo-${index}`,
    )));
    expect(outcomes.filter((item) => "board" in item)).toHaveLength(1);
    expect(outcomes.filter((item) => "stale" in item)).toHaveLength(1);
    expect(await prepareHistory(initialBoard.id, "undo", state("before"))).toBeNull();
    expect(await prepareHistory(initialBoard.id, "redo", state("before"))).not.toBeNull();
  });

  it("clears the durable redo branch after a new committed edit", async () => {
    const before = state("before"), firstEdit = state("first edit");
    const initialBoard = await fixture(before);
    await commit(initialBoard, before, firstEdit, (tx) => rememberChange(tx, initialBoard.id, before, firstEdit), "first-edit");
    const afterFirstEdit = await prisma.workspaceBoard.findUnique({ where: { id: initialBoard.id } });
    const undo = await prepareHistory(initialBoard.id, "undo", boardState(afterFirstEdit));
    await commit(afterFirstEdit!, boardState(afterFirstEdit), undo!.snapshot as AgentBoardState, undo!.complete, "undo-first-edit");

    const afterUndo = await prisma.workspaceBoard.findUnique({ where: { id: initialBoard.id } });
    const newBranch = state("new branch");
    await commit(afterUndo!, boardState(afterUndo), newBranch, (tx) => rememberChange(tx, initialBoard.id, boardState(afterUndo), newBranch), "new-branch");
    expect(await prepareHistory(initialBoard.id, "redo", newBranch)).toBeNull();
  });
});
