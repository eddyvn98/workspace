// @vitest-environment node

import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { inspectWorkspaceChatActionAnswer } from "@/app/workspace/utils/workspaceChatActions";
import { mapLayoutPatchForCreate, normalizeCreateMapOptions } from "@/app/workspace/utils/workspaceChatMapOptions";

describe("Workspace AI map contract", () => {
  it("preserves structured map options through the chat action parser", () => {
    const result = inspectWorkspaceChatActionAnswer(JSON.stringify({
      message: "created",
      actions: [{
        type: "create_map",
        layoutType: "timeline",
        layoutDirection: "down",
        timelineBranchMode: "alternate",
        connectorPaletteId: "pastel",
        connectionStyle: "curved",
        nodes: [{ topic: "Roadmap", children: [{ topic: "Launch" }] }],
      }],
    }));

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      kind: "create_map",
      options: {
        layoutType: "timeline",
        layoutDirection: "down",
        timelineBranchMode: "alternate",
        connectorPaletteId: "pastel",
        connectionStyle: "curved",
      },
    });
    expect(mapLayoutPatchForCreate(normalizeCreateMapOptions({ layoutType: "timeline", connectionStyle: "curved" }))).toMatchObject({
      family: "timeline",
      direction: "right",
    });
  });

  it("does not reinterpret flowchart creation as a tree map", () => {
    const result = inspectWorkspaceChatActionAnswer(JSON.stringify({
      actions: [{ type: "create_map", layoutType: "flowchart", nodes: [{ topic: "Start" }] }],
    }));
    expect(result.actions).toHaveLength(0);
  });

  it("recognizes flowchart extension as a diagram action", () => {
    const result = inspectWorkspaceChatActionAnswer(JSON.stringify({
      actions: [{ type: "extend_flowchart", target: { mode: "topic", topic: "Start" }, nodes: [], edges: [] }],
    }));
    expect(result.actions[0]).toMatchObject({ kind: "diagram", type: "extend_flowchart" });
  });

  it("replays the complete freehand CRUD lifecycle through the shared executor", () => {
    const board: AgentBoardState = { title: "Freehand replay", blocks: {}, blockOrder: [], connectors: {} };
    const created = applyAgentAction(board, {
      type: "create_freehand",
      points: [{ x: 0, y: 0 }, { x: 24, y: 16 }, { x: 48, y: 8 }],
      tool: "pen",
      color: "#2563eb",
      width: 4,
    });
    const sourceId = created.ids[0];

    expect(board.blocks[sourceId]).toMatchObject({
      type: "path",
      data: { tool: "pen", strokeColor: "#2563eb", strokeWidth: 4 },
    });

    const updated = applyAgentAction(board, {
      type: "update_freehand",
      strokeId: sourceId,
      points: [{ x: 4, y: 6 }, { x: 40, y: 20 }],
      tool: "highlighter",
      color: "#f59e0b",
      opacity: 65,
    });
    expect(updated.ids).toEqual([sourceId]);
    expect(board.blocks[sourceId].data).toMatchObject({
      points: [{ x: 4, y: 6 }, { x: 40, y: 20 }],
      tool: "highlighter",
      strokeColor: "#f59e0b",
      opacity: 0.65,
    });

    const styleOnlyUpdate = applyAgentAction(board, {
      type: "update_freehand",
      strokeId: sourceId,
      strokeColor: "#16a34a",
      width: 3,
    });
    expect(styleOnlyUpdate.ids).toEqual([sourceId]);
    expect(board.blocks[sourceId].data).toMatchObject({
      points: [{ x: 4, y: 6 }, { x: 40, y: 20 }],
      strokeColor: "#16a34a",
      strokeWidth: 3,
    });

    const duplicated = applyAgentAction(board, { type: "duplicate_freehand", strokeId: sourceId, offsetX: 32, offsetY: 18 });
    const duplicateId = duplicated.ids[0];
    expect(duplicateId).not.toBe(sourceId);
    expect(board.blocks[duplicateId]).toMatchObject({ type: "path", data: board.blocks[sourceId].data });

    expect(applyAgentAction(board, { type: "delete_freehand", strokeId: sourceId }).ids).toEqual([sourceId]);
    expect(board.blocks[sourceId]).toBeUndefined();
    expect(board.blocks[duplicateId]).toBeDefined();
  });
});
