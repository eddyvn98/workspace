// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { editorLayoutName, resolveLayoutRequest } from "@/app/api/workspaces/[id]/agent/mapLayoutRequest";

const layoutOf = (raw: Record<string, unknown>) => {
  const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "t" };
  const rootId = applyAgentAction(state, { type: "create_map", nodes: [{ topic: "Root", children: [{ topic: "A" }, { topic: "B" }] }], ...raw }).ids[0];
  return state.blocks[rootId].mapLayout as { family: string; direction: string; growthMode: string; connectorLineType: string };
};

describe("map layout names match the editor", () => {
  it("Hierarchy takes its options from One side/Both side and Direction", () => {
    expect(layoutOf({ layoutType: "hierarchy" })).toMatchObject({ family: "hierarchy", direction: "right", growthMode: "one-side" });
    expect(layoutOf({ layoutType: "Hierarchy", layoutDirection: "down" })).toMatchObject({ family: "hierarchy", direction: "down", growthMode: "one-side" });
    expect(layoutOf({ layoutType: "hierarchy", layoutDirection: "up" })).toMatchObject({ direction: "up" });
    expect(layoutOf({ layoutType: "hierarchy", layoutDirection: "left" })).toMatchObject({ direction: "left" });
    expect(layoutOf({ layoutType: "hierarchy", growthMode: "both-side" })).toMatchObject({ direction: "right", growthMode: "both-side" });
    expect(layoutOf({ layoutType: "hierarchy", growthMode: "both-side", layoutDirection: "down" })).toMatchObject({ direction: "down", growthMode: "both-side" });
  });

  it("older names land on the same editor settings", () => {
    expect(layoutOf({ layoutType: "mindmap" })).toMatchObject({ family: "hierarchy", growthMode: "both-side" });
    expect(layoutOf({ layoutType: "org-chart" })).toMatchObject({ family: "hierarchy", direction: "down", growthMode: "one-side" });
    expect(layoutOf({ layoutType: "logical-left" })).toMatchObject({ family: "hierarchy", direction: "left" });
  });

  it("Treeview, Timeline and Fishbone use the editor names, with catalog and vertical-timeline as aliases", () => {
    expect(layoutOf({ layoutType: "Treeview" })).toMatchObject({ family: "treeview" });
    expect(layoutOf({ layoutType: "catalog" })).toMatchObject({ family: "treeview" });
    expect(layoutOf({ layoutType: "timeline" })).toMatchObject({ family: "timeline", direction: "right" });
    expect(layoutOf({ layoutType: "timeline", layoutDirection: "down" })).toMatchObject({ family: "timeline", direction: "down" });
    expect(layoutOf({ layoutType: "vertical-timeline" })).toMatchObject({ family: "timeline", direction: "down" });
    expect(layoutOf({ layoutType: "Fishbone" })).toMatchObject({ family: "fishbone" });
  });

  it("the editor's line names are accepted: Elbow is orthogonal", () => {
    expect(layoutOf({ layoutType: "hierarchy", connectionStyle: "elbow" })).toMatchObject({ connectorLineType: "orthogonal" });
    expect(layoutOf({ layoutType: "hierarchy", connectionStyle: "straight" })).toMatchObject({ connectorLineType: "straight" });
  });

  it("converting with an editor name changes the stored layout", () => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "t" };
    const rootId = applyAgentAction(state, { type: "create_map", layoutType: "mindmap", nodes: [{ topic: "Root", children: [{ topic: "A" }, { topic: "B" }] }] }).ids[0];
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "Treeview" });
    expect((state.blocks[rootId].mapLayout as { family: string }).family).toBe("treeview");
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "Hierarchy", layoutDirection: "down" });
    expect(state.blocks[rootId].mapLayout).toMatchObject({ family: "hierarchy", direction: "down" });
  });

  it("applies a direction supplied inside the mapLayout object", () => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "t" };
    const rootId = applyAgentAction(state, { type: "create_map", nodes: [{ topic: "Root", children: [{ topic: "A" }, { topic: "B" }] }] }).ids[0];

    const result = applyAgentAction(state, {
      type: "update_map_style",
      target: rootId,
      mapLayout: { family: "hierarchy", direction: "left" },
    });

    expect(result.geometryChanged).toBe(true);
    expect(state.blocks[rootId].mapLayout).toMatchObject({ family: "hierarchy", direction: "left" });
  });

  it("names a stored layout the way the editor does", () => {
    expect(editorLayoutName({ family: "hierarchy", growthMode: "both-side", direction: "right" })).toBe("Hierarchy (Both side, Right)");
    expect(editorLayoutName({ family: "orgchart", growthMode: "one-side", direction: "down" })).toBe("Hierarchy (One side, Down)");
    expect(editorLayoutName({ family: "treeview", direction: "right" })).toBe("Treeview (Right)");
    expect(editorLayoutName({ family: "fishbone" })).toBe("Fishbone");
    expect(resolveLayoutRequest({ layoutType: "radial" })).toEqual({ requested: "radial" });
  });
});

describe("a structure change does not inherit the old map's direction", () => {
  const build = (layoutType: string, extra: Record<string, unknown> = {}) => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "t" };
    const rootId = applyAgentAction(state, { type: "create_map", layoutType, ...extra, nodes: [{ topic: "Root", children: [{ topic: "A" }, { topic: "B" }] }] }).ids[0];
    return { state, rootId };
  };

  it("Timeline after Hierarchy (Down) is horizontal unless a direction is asked for", () => {
    const { state, rootId } = build("hierarchy", { layoutDirection: "down" });
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "timeline" });
    expect(state.blocks[rootId].mapLayout).toMatchObject({ family: "timeline", direction: "right" });
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "timeline", layoutDirection: "down" });
    expect(state.blocks[rootId].mapLayout).toMatchObject({ family: "timeline", direction: "down" });
  });

  it("Hierarchy after a Both side map is One side, Right unless asked otherwise", () => {
    const { state, rootId } = build("hierarchy", { growthMode: "both-side", layoutDirection: "down" });
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "treeview" });
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "hierarchy" });
    expect(state.blocks[rootId].mapLayout).toMatchObject({ family: "hierarchy", direction: "right", growthMode: "one-side" });
  });
});

describe("receipt note for map layouts", () => {
  it("tells the model to report the editor name exactly", async () => {
    const { receiptNotes } = await import("@/app/api/workspaces/[id]/agent/receiptNotes");
    const notes = receiptNotes([{ type: "update_map_style", ids: ["r"] }], { r: { mapLayout: { family: "hierarchy", growthMode: "one-side", direction: "down" } } });
    expect(notes.join(" ")).toContain('exactly as "Hierarchy (One side, Down)"');
    expect(receiptNotes([{ type: "update_style", ids: ["r"] }], { r: { mapLayout: { family: "hierarchy" } } })).toEqual([]);
  });
});
