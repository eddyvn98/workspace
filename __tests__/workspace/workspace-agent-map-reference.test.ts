import { describe, expect, it } from "vitest";
import { applyAgentAction } from "@/app/api/workspaces/[id]/agent/operations";
import { validateWorkspaceRuntimeAction } from "@/lib/workspace-agent/actionSchema";

describe("semantic references between actions in a new map batch", () => {
  it("connects and styles nodes by the ids supplied with create_map", () => {
    const state = { title: "Board", blocks: {}, blockOrder: [], connectors: {} };
    const created = applyAgentAction(state, {
      type: "create_map",
      layoutType: "hierarchy",
      nodes: [{ id: "root", topic: "Root", children: [
        { id: "content", topic: "Content" },
        { id: "diagram", topic: "Diagram" },
        { id: "slides", topic: "Slides" },
      ] }],
    });
    expect(created.ids).toHaveLength(4);

    const connected = applyAgentAction(state, { type: "connect_nodes", from: "content", to: "diagram", label: "covers" });
    const styled = applyAgentAction(state, { type: "update_style", blockId: "slides", style: { backgroundColor: "#e6f4ea" } });

    expect(connected.ids).toHaveLength(1);
    expect(styled.ids).toHaveLength(1);
    expect(state.connectors[connected.ids[0]]).toMatchObject({ label: "covers" });
    expect(state.blocks[styled.ids[0]].style).toMatchObject({ backgroundColor: "#e6f4ea" });
  });

  it("rejects duplicate semantic IDs before execution", () => {
    expect(validateWorkspaceRuntimeAction({
      type: "create_map",
      nodes: [{ id: "same", topic: "Root", children: [{ id: "same", topic: "Child" }] }],
    })).toBe("create_map node ids must be unique.");
  });

  it("rejects a semantic ID already used by a node on the board", () => {
    const existing = { id: "existing", type: "text", data: { markdown: "Existing", semanticKey: "content" } };
    const state = { title: "Board", blocks: { existing }, blockOrder: ["existing"], connectors: {} };
    const created = applyAgentAction(state, {
      type: "create_map", layoutType: "hierarchy", nodes: [{ id: "content", topic: "Content" }],
    });
    expect(created.ids).toEqual([]);
    expect(created.reason).toContain("unique across the board");
    expect(Object.keys(state.blocks)).toEqual(["existing"]);
  });
});
