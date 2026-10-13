// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { validateWorkspaceRuntimeAction } from "@/lib/workspace-agent/actionSchema";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import { isWorkspaceCommandName } from "@/lib/workspace-command-registry";

function board(): AgentBoardState {
  const at = (x: number, y: number, w = 100, h = 50, extra: object = {}) => ({ type: "text", transform: { computed: null, override: { x, y, w, h, zIndex: 5 } }, ...extra });
  return {
    title: "t",
    blockOrder: ["root", "kid", "far"],
    blocks: {
      root: { id: "root", ...at(100, 100), data: { markdown: "Root" } },
      kid: { id: "kid", ...at(300, 200), parentId: "root", data: { markdown: "Kid" } },
      far: { id: "far", ...at(1000, 900), data: { markdown: "Elsewhere" } },
    },
    connectors: {},
  };
}

describe("wrap_blocks_in_frame", () => {
  it("is a registered command", () => {
    expect(isWorkspaceCommandName("wrap_blocks_in_frame")).toBe(true);
  });

  it("encloses a branch (root plus descendants) with padding, behind it, and not the rest", () => {
    const state = board();
    const { ids } = applyAgentAction(state, { type: "wrap_blocks_in_frame", target: "Root", title: "Mindmap", padding: 40 });
    const frame = state.blocks[ids[0]];
    const t = (frame.transform as { override: Record<string, number> }).override;
    expect(frame.type).toBe("shape");
    expect(t).toMatchObject({ x: 60, y: 60, w: 380, h: 230 });
    expect(t.zIndex).toBeLessThan(5);
    expect(state.blockOrder[0]).toBe(ids[0]);
    expect(frame.style).toMatchObject({ backgroundColor: "transparent", borderDash: "dashed" });
    const title = state.blocks[ids[1]];
    expect(title.data).toMatchObject({ markdown: "Mindmap", fontWeight: "bold" });
    expect((title.transform as { override: Record<string, number> }).override.y).toBeLessThan(60);
  });

  it("wraps every block for scope all and creates no title when none is given", () => {
    const state = board();
    const { ids } = applyAgentAction(state, { type: "wrap_blocks_in_frame", scope: "all" });
    expect(ids).toHaveLength(1);
    const t = (state.blocks[ids[0]].transform as { override: Record<string, number> }).override;
    expect(t).toMatchObject({ x: 60, y: 60, w: 1080, h: 930 });
  });

  it("does nothing when the target cannot be resolved", () => {
    expect(applyAgentAction(board(), { type: "wrap_blocks_in_frame", target: "Missing" }).ids).toEqual([]);
  });
});

describe("presentation frame receipt note", () => {
  it("warns that a presentation frame draws nothing and points to wrap_blocks_in_frame", async () => {
    const { receiptNotes } = await import("@/app/api/workspaces/[id]/agent/receiptNotes");
    expect(receiptNotes([{ type: "create_frame" }])[0]).toContain("wrap_blocks_in_frame");
    expect(receiptNotes([{ type: "update_frame" }])).toHaveLength(1);
    expect(receiptNotes([{ type: "update_style" }])).toEqual([]);
  });
});

describe("Workspace agent frame replay guard", () => {
  it("does not recreate a persisted frame when Dify repeats it in a later round", async () => {
    const frame = { type: "wrap_blocks_in_frame", targets: ["table-1"], title: "Table acceptance", movable: true };
    const replay = { ...frame, blockId: "created-frame-id", movable: false };
    const propose = vi.fn()
      .mockResolvedValueOnce({ answer: JSON.stringify({ done: false, message: "Created.", actions: [frame] }), conversationId: "dify-1" })
      .mockResolvedValueOnce({ answer: JSON.stringify({ done: false, message: "Trying again.", actions: [replay] }), conversationId: "dify-1" });
    const execute = vi.fn().mockResolvedValue({
      httpStatus: 200,
      body: { success: true, revision: 2, actions: [{ changed: true, ids: ["frame-1"] }], result: {} },
    });
    const input = {
      boardId: "board-1", turnId: "turn-1", query: "Create a dashed frame named Table acceptance around table-1.",
      modelSelector: "gpt", authorization: "Bearer test", workspaceUserToken: "user-token",
      canMutate: true, signal: new AbortController().signal,
    };

    const result = await runWorkspaceAgentTurn(input, {
      readSnapshot: vi.fn().mockResolvedValue({ revision: 1, title: "Board", blocks: { "table-1": { type: "table" } }, blockOrder: ["table-1"], connectors: {} }),
      execute,
      modelProvider: { propose },
    });

    expect(result.status).toBe("completed");
    expect(result.rounds).toBe(2);
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0]).toMatchObject({ actionType: "wrap_blocks_in_frame", persisted: true });
    expect(propose).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("accepts the existing-container frame edit contract", () => {
    expect(validateWorkspaceRuntimeAction({ type: "wrap_blocks_in_frame", frameId: "frame-1", mode: "fit" })).toBeNull();
  });
});
