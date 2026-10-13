import { describe, expect, it, vi } from "vitest";
import { applyInverse } from "@/app/api/workspaces/[id]/agent/history";
import type { AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { commitAgentMutation } from "@/app/api/workspaces/[id]/agent/commitMutation";

const board = (blocks: Record<string, unknown>, order: string[]) =>
  ({ title: "t", blocks, blockOrder: order, connectors: {} }) as unknown as AgentBoardState;
const text = (id: string, markdown: string) => ({ id, data: { markdown } });

describe("durable agent history merge", () => {
  it("undoes an AI addition while preserving a later human edit", () => {
    const before = board({ a: text("a", "A") }, ["a"]);
    const after = board({ a: text("a", "A"), n: text("n", "NEW") }, ["a", "n"]);
    const current = board({ a: text("a", "HUMAN"), n: text("n", "NEW") }, ["a", "n"]);

    const undone = applyInverse(current, after, before) as typeof current;
    expect(Object.keys(undone.blocks)).toEqual(["a"]);
    expect((undone.blocks.a as ReturnType<typeof text>).data.markdown).toBe("HUMAN");
    expect(undone.blockOrder).toEqual(["a"]);
  });

  it("keeps a block that someone changed after the AI turn", () => {
    const before = board({ a: text("a", "A") }, ["a"]);
    const after = board({ a: text("a", "AI") }, ["a"]);
    const current = board({ a: text("a", "HUMAN") }, ["a"]);
    const undone = applyInverse(current, after, before) as typeof current;
    expect((undone.blocks.a as ReturnType<typeof text>).data.markdown).toBe("HUMAN");
  });

  it("undoes only the AI-edited fields when collaboration metadata changes", () => {
    const before = board({ doc: { id: "doc", type: "doc", data: { html: "<p>Before</p>", notes: "base" }, updatedAt: 1 } }, ["doc"]);
    const after = board({ doc: { id: "doc", type: "doc", data: { html: "<p>After</p>", notes: "base" }, updatedAt: 2, lastEditedBy: "AI" } }, ["doc"]);
    const current = board({ doc: { id: "doc", type: "doc", data: { html: "<p>After</p>", notes: "Human edit" }, updatedAt: 3, lastEditedBy: "Human" } }, ["doc"]);

    const undone = applyInverse(current, after, before) as typeof current;
    expect(undone.blocks.doc).toEqual({ id: "doc", type: "doc", data: { html: "<p>Before</p>", notes: "Human edit" }, updatedAt: 3, lastEditedBy: "Human" });
  });

  it("does not consume history when the inverse would make no board change", async () => {
    const completeHistory = vi.fn(async () => {});
    const state = board({ a: text("a", "same") }, ["a"]);
    const response = await commitAgentMutation({
      board: { id: "board", revision: 7 } as never,
      email: "test@example.com",
      state,
      previousState: state,
      content: { title: "t", blocks: state.blocks, blockOrder: state.blockOrder, connectors: state.connectors },
      editEvents: [],
      appliedActions: [{ type: "undo", ids: ["undo"], changed: true }],
      plannedActionCount: 1,
      action: "batch",
      receiptKey: null,
      completeHistory,
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.reason).toBe("history_conflict");
    expect(completeHistory).not.toHaveBeenCalled();
  });

  it("treats object key order as unchanged and can redo an undone addition", () => {
    const before = board({}, []);
    const after = board({ n: { id: "n", data: { markdown: "N", a: 1 }, type: "text" } }, ["n"]);
    const current = board({ n: { type: "text", data: { a: 1, markdown: "N" }, id: "n" } }, ["n"]);
    const undone = applyInverse(current, after, before) as typeof current;
    expect(Object.keys(undone.blocks)).toEqual([]);
    const redone = applyInverse(undone, before, after) as typeof current;
    expect(Object.keys(redone.blocks)).toEqual(["n"]);
    expect((redone.blocks.n as ReturnType<typeof text>).data.markdown).toBe("N");
  });
});
