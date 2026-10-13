// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";

function board(): AgentBoardState {
  return {
    title: "Relationship test",
    blockOrder: ["r", "b", "s1", "s2"],
    blocks: {
      r: { id: "r", type: "text", data: { markdown: "Root" } },
      b: { id: "b", type: "text", data: { markdown: "Branch" } },
      s1: { id: "s1", type: "text", data: { markdown: "1. Open page", semanticKey: "step-1" } },
      s2: { id: "s2", type: "text", data: { markdown: "2. Enter name", semanticKey: "step-2" } },
    },
    connectors: {
      c1: { id: "c1", fromBlockId: "r", toBlockId: "b", lineType: "straight" },
      c2: { id: "c2", fromBlockId: "s1", toBlockId: "s2", lineType: "orthogonal", arrowEnd: true },
    },
  };
}

describe("update_relationship", () => {
  it.each([
    ["labels", { from: "Root", to: "Branch", lineColor: "#ef4444" }],
    ["block ids", { from: "r", to: "b", relationshipPatch: { lineColor: "#ef4444" } }],
    ["connectorId", { connectorId: "c1", relationshipPatch: { lineColor: "#ef4444" } }],
    ["reversed direction", { from: "b", to: "r", relationshipPatch: { strokeColor: "#ef4444" } }],
  ])("recolors a connector addressed by %s", (_name, extra) => {
    const state = board();
    const result = applyAgentAction(state, { type: "update_relationship", ...extra });
    expect(result.ids).toEqual(["c1"]);
    expect(state.connectors.c1.strokeColor).toBe("#ef4444");
    expect(state.connectors.c2.strokeColor).toBeUndefined();
  });

  it("accepts label and dashed spellings the prompt allows", () => {
    const state = board();
    applyAgentAction(state, { type: "update_relationship", from: "step-1", to: "step-2", relationshipPatch: { label: "required", dashed: true } });
    expect(state.connectors.c2).toMatchObject({ label: "required", dashed: true });
  });

  it("maps straight_arrow to a straight line with an arrowhead", () => {
    const state = board();
    applyAgentAction(state, { type: "update_relationship", connectorId: "c1", relationshipPatch: { type: "straight_arrow" } });
    expect(state.connectors.c1).toMatchObject({ lineType: "straight", arrowEnd: true });
  });

  it("accepts flat fromBlockId/toBlockId and object targets", () => {
    const state = board();
    applyAgentAction(state, { type: "update_relationship", fromBlockId: "r", toBlockId: "b", relationshipPatch: { lineColor: "#111111" } });
    applyAgentAction(state, { type: "update_relationship", from: { mode: "topic", topic: "1. Open page" }, to: { mode: "id", id: "s2" }, relationshipPatch: { lineWidth: 4 } });
    expect(state.connectors.c1.strokeColor).toBe("#111111");
    expect(state.connectors.c2.strokeWidth).toBe(4);
  });

  it("still finds a node by plain name after it was bolded with markdown", () => {
    const state = board();
    state.blocks.r.data = { markdown: "**Root**" };
    applyAgentAction(state, { type: "update_relationship", from: { mode: "topic", topic: "Root" }, to: "b", lineColor: "#222222" });
    expect(state.connectors.c1.strokeColor).toBe("#222222");
  });

  it("treats the schema's \"none\" arrow value as off", () => {
    const state = board();
    applyAgentAction(state, { type: "update_relationship", connectorId: "c2", relationshipPatch: { arrowEnd: "none", arrowStart: "arrow" } });
    expect(state.connectors.c2).toMatchObject({ arrowEnd: false, arrowStart: true });
  });

  it("reports no ids when no connector matches", () => {
    const state = board();
    const result = applyAgentAction(state, { type: "update_relationship", from: "r", to: "s2", lineColor: "#000" });
    expect(result.ids).toEqual([]);
  });
});
