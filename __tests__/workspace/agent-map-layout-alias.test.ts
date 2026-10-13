// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { resolveLayoutRequest } from "@/app/api/workspaces/[id]/agent/mapLayout";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";

function mapState(): AgentBoardState {
  const at = (x: number, y: number) => ({ transform: { computed: null, override: { x, y, w: 120, h: 40, zIndex: 1 } } });
  return {
    title: "t",
    blockOrder: ["root", "a", "b"],
    blocks: {
      root: { id: "root", type: "text", mapId: "m", mapLayout: { family: "hierarchy", direction: "right", growthMode: "both-side" }, data: { markdown: "Learning" }, ...at(0, 0) },
      a: { id: "a", type: "text", mapId: "m", parentId: "root", data: { markdown: "A" }, ...at(200, -40) },
      b: { id: "b", type: "text", mapId: "m", parentId: "root", data: { markdown: "B" }, ...at(200, 40) },
    },
    connectors: {},
  };
}

describe("update_map_style layout request", () => {
  it("accepts a bounded palette and layout update proposal", () => {
    const proposal = JSON.stringify({ done: false, message: "Updated the map.", actions: [{
      type: "update_map_style", blockId: "root", layoutType: "fishbone", connectorPaletteId: "vibrant", growthMode: "one-side",
    }] });
    expect(parseWorkspaceModelProposal(proposal).actions).toHaveLength(1);
    const extra = JSON.stringify({ done: false, message: "Done.", actions: [{ type: "update_map_style", blockId: "root", custom: true }] });
    expect(() => parseWorkspaceModelProposal(extra)).toThrow(/unsupported fields/);
  });

  it.each([
    { type: "extend_flowchart", blockId: "root", nodes: [{ id: "n2", topic: "Review" }], edges: [{ from: "Start", to: "Review" }] },
    { type: "disconnect_nodes", fromBlockId: "n1", toBlockId: "n2" },
    { type: "repair_connector", source: "Start", to: "Review", label: "yes" },
    { type: "update_relationship", between: { fromBlockId: "n1", toBlockId: "n2" }, relationshipPatch: { lineColor: "#3355aa", arrowEnd: true } },
    { type: "update_transform", blockId: "root", transform: { x: 400, y: 200 } },
    { type: "update_z_order", blockId: "root", zOrder: "front" },
    { type: "search_replace", query: "old", replacement: "new", replaceAll: true },
    { type: "arrange_selection", blockIds: ["a", "b"], mode: "grid" },
    { type: "reorder_nodes", blockId: "root", nodes: ["a", { nodeId: "b" }] },
  ])("accepts bounded diagram action", (action) => {
    const proposal = JSON.stringify({ done: false, message: "Done.", actions: [action] });
    expect(parseWorkspaceModelProposal(proposal).actions).toEqual([action]);
  });

  it.each([
    [{ type: "extend_flowchart", blockId: "root", nodes: [] }, /requires nodes or edges/],
    [{ type: "disconnect_nodes", from: "Start" }, /both connector endpoints/],
    [{ type: "update_relationship", connectorId: "edge-1" }, /relationship property/],
    [{ type: "update_transform", blockId: "root" }, /transform value/],
    [{ type: "arrange_selection", blockIds: ["a"] }, /blockIds/],
    [{ type: "reorder_nodes", blockId: "root", nodes: [{ id: "a", extra: true }] }, /block IDs/],
  ])("rejects incomplete diagram action", (action, issue) => {
    const proposal = JSON.stringify({ done: false, message: "Done.", actions: [action] });
    expect(() => parseWorkspaceModelProposal(proposal)).toThrow(issue);
  });

  it("understands other keys and spellings", () => {
    expect(resolveLayoutRequest({ layout: "Fish bone" }).layout).toBe("fishbone");
    expect(resolveLayoutRequest({ layoutStyle: "org chart" }).layout).toBe("logical-down");
    expect(resolveLayoutRequest({ params: { mapType: "Timeline" } }).layout).toBe("timeline");
    expect(resolveLayoutRequest({ layoutType: "radial" })).toEqual({ requested: "radial" });
    expect(resolveLayoutRequest({ color: "red" })).toEqual({});
  });

  it("changes the family when the model sends layout instead of layoutType", () => {
    const state = mapState();
    const { ids } = applyAgentAction(state, { type: "update_map_style", target: "root", layout: "fishbone" });
    expect(ids).toEqual(["root"]);
    expect((state.blocks.root.mapLayout as { family: string }).family).toBe("fishbone");
  });

  it("refuses an unknown layout instead of reporting a silent success", () => {
    const state = mapState();
    expect(applyAgentAction(state, { type: "update_map_style", target: "root", layoutType: "radial" }).ids).toEqual([]);
    expect((state.blocks.root.mapLayout as { family: string }).family).toBe("hierarchy");
  });
});
