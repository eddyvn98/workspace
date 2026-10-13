// @vitest-environment node

import { describe, expect, it } from "vitest";
import { applyAgentAction, ensureMapClearOfOtherBlocks, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { layoutExistingMap } from "@/app/api/workspaces/[id]/agent/mapLayout";
import { blockRect } from "@/app/api/workspaces/[id]/agent/operationsCore";
import { applyServerMapPalette, normalizeAgentMapLayoutAction } from "@/app/api/workspaces/[id]/agent/mapStyleParity";

function rect(block: Record<string, unknown>) {
  const transform = block.transform as { computed?: Record<string, number> };
  return transform.computed!;
}

function overlaps(a: Record<string, number>, b: Record<string, number>): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("Dify create_map layout", () => {
  it("accepts Dify's between.fromBlockId/toBlockId shape for relationship updates", () => {
    const state: AgentBoardState = {
      blocks: { source: { id: "source" }, target: { id: "target" } },
      blockOrder: ["source", "target"],
      connectors: { connector: { id: "connector", fromBlockId: "source", toBlockId: "target" } },
      title: "Test",
    };

    const result = applyAgentAction(state, {
      type: "update_relationship",
      between: { fromBlockId: "source", toBlockId: "target" },
      relationshipPatch: { lineColor: "#123456", lineWidth: 3 },
    });

    expect(result.ids).toEqual(["connector"]);
    expect(state.connectors.connector).toMatchObject({ strokeColor: "#123456", strokeWidth: 3 });
  });

  it("accepts a flat topic draft when adding a child through a Workspace action", () => {
    const state: AgentBoardState = {
      blocks: { root: { id: "root" } },
      blockOrder: ["root"],
      connectors: {},
      title: "Test",
    };

    const result = applyAgentAction(state, { type: "add_child", parentId: "root", topic: "Phase 1" });

    expect(result.ids).toHaveLength(1);
    expect(state.blocks[result.ids[0]]).toMatchObject({ parentId: "root", data: { markdown: "Phase 1" } });
    expect(Object.values(state.connectors)).toHaveLength(1);
    expect(Object.values(state.connectors)[0]).toMatchObject({ fromBlockId: "root", toBlockId: result.ids[0] });
  });

  it("reflows all existing descendants when a map family is explicitly selected", () => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const root = applyAgentAction(state, { type: "create_map", nodes: [{ topic: "Launch" }] }).ids[0];
    const phases = ["Research", "Prepare", "Pilot", "Launch"].map((topic) =>
      applyAgentAction(state, { type: "add_child", parentId: root, topic }).ids[0]
    );
    phases.forEach((phaseId, index) => {
      applyAgentAction(state, { type: "add_child", parentId: phaseId, topic: `Task ${index + 1}` });
    });
    applyAgentAction(state, { type: "update_map_style", target: root, layoutType: "mindmap" });

    const mapIds = [root, ...phases, ...Object.values(state.blocks).filter((block) => phases.includes(String(block.parentId))).map((block) => String(block.id))];
    const blocks = mapIds.map((blockId) => state.blocks[blockId]);
    blocks.forEach((block) => expect(block.transform.override).toBeNull());
    for (let left = 0; left < blocks.length; left += 1) {
      for (let right = left + 1; right < blocks.length; right += 1) {
        expect(overlaps(rect(blocks[left]), rect(blocks[right]))).toBe(false);
      }
    }
    expect(state.blocks[root].mapLayout).toMatchObject({ family: "hierarchy", growthMode: "both-side" });
  });

  it("moves a newly laid-out map clear of unrelated blocks without editing them", () => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const root = applyAgentAction(state, { type: "create_map", nodes: [{ topic: "Launch" }] }).ids[0];
    const child = applyAgentAction(state, { type: "add_child", parentId: root, topic: "Phase 1" }).ids[0];
    state.blocks.obstacle = { id: "obstacle", transform: { computed: null, override: { x: 360, y: 80, w: 220, h: 100 } } };
    state.blockOrder.push("obstacle");

    applyAgentAction(state, { type: "update_map_style", target: root, layoutType: "mindmap" });

    const mapBlocks = [state.blocks[root], state.blocks[child]];
    expect(mapBlocks.every((block) => !overlaps(blockRect(block), { x: 360, y: 80, w: 220, h: 100 }))).toBe(true);
    expect(state.blocks.obstacle.transform).toEqual({ computed: null, override: { x: 360, y: 80, w: 220, h: 100 } });
  });

  it("preserves an AI-authored layout when translating a map away from unrelated blocks", () => {
    const state: AgentBoardState = {
      blocks: {
        root: { id: "root", transform: { computed: null, override: { x: 0, y: 0, w: 240, h: 100 } } },
        child: { id: "child", parentId: "root", transform: { computed: null, override: { x: 400, y: 0, w: 240, h: 100 } } },
        obstacle: { id: "obstacle", transform: { computed: null, override: { x: 0, y: 0, w: 240, h: 100 } } },
      },
      blockOrder: ["root", "child", "obstacle"],
      connectors: {},
      title: "Test",
    };

    ensureMapClearOfOtherBlocks(state, "root", { preserveManualPositions: true });

    const rootRect = blockRect(state.blocks.root);
    const childRect = blockRect(state.blocks.child);
    expect(state.blocks.root.transform.override).not.toBeNull();
    expect(state.blocks.child.transform.override).not.toBeNull();
    expect(state.blocks.root.transform.computed).toBeNull();
    expect(childRect.x - rootRect.x).toBe(400);
    expect(overlaps(rootRect, blockRect(state.blocks.obstacle))).toBe(false);
    expect(overlaps(childRect, blockRect(state.blocks.obstacle))).toBe(false);
  });

  it("rechecks the whole map after later AI transforms in the same action batch", () => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const root = applyAgentAction(state, { type: "create_map", nodes: [{ topic: "Launch" }] }).ids[0];
    const child = applyAgentAction(state, { type: "add_child", parentId: root, topic: "Phase 1" }).ids[0];
    state.blocks.obstacle = { id: "obstacle", transform: { computed: null, override: { x: 360, y: 80, w: 220, h: 100 } } };
    state.blockOrder.push("obstacle");

    applyAgentAction(state, { type: "update_map_style", target: root, layoutType: "mindmap" });
    [root, child].forEach((blockId) => {
      state.blocks[blockId].transform = { computed: null, override: { x: 360, y: 80, w: 240, h: 120 } };
    });
    ensureMapClearOfOtherBlocks(state, root);

    expect([root, child].every((blockId) => !overlaps(blockRect(state.blocks[blockId]), blockRect(state.blocks.obstacle)))).toBe(true);
    expect(state.blocks.obstacle.transform).toEqual({ computed: null, override: { x: 360, y: 80, w: 220, h: 100 } });
  });

  it("lets an explicit mindmap layout override stray per-block coordinates later in the batch", () => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const root = applyAgentAction(state, { type: "create_map", nodes: [{ topic: "Launch" }] }).ids[0];
    const phases = ["Research", "Prepare", "Pilot", "Launch"].map((topic) =>
      applyAgentAction(state, { type: "add_child", parentId: root, topic }).ids[0]
    );
    phases.forEach((phaseId) => applyAgentAction(state, { type: "add_child", parentId: phaseId, topic: "Task" }));
    const layoutAction = { type: "update_map_style", target: root, layoutType: "mindmap" };
    applyAgentAction(state, layoutAction);
    Object.values(state.blocks).forEach((block) => {
      block.transform = { computed: null, override: { x: 1200, y: 400, w: 240, h: 100 } };
    });

    layoutExistingMap(state, root, layoutAction);
    ensureMapClearOfOtherBlocks(state, root);

    const blocks = Object.values(state.blocks);
    for (let left = 0; left < blocks.length; left += 1) {
      for (let right = left + 1; right < blocks.length; right += 1) {
        expect(overlaps(blockRect(blocks[left]), blockRect(blocks[right]))).toBe(false);
      }
    }
  });

  it("keeps an AI-authored custom layout when a follow-up update_map_style call repeats the current layout unchanged", () => {
    // Planner models routinely re-send the map's current layoutType as part
    // of completing the tool schema, even when the user only asked for a
    // custom per-block arrangement (via update_transform) or an unrelated
    // tweak. Re-affirming the same family/direction/growthMode must not
    // discard those manually placed positions by forcing a fresh tree layout.
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const root = applyAgentAction(state, { type: "create_map", nodes: [{ topic: "Goal" }] }).ids[0];
    const phases = ["Phase 1", "Phase 2"].map((topic) =>
      applyAgentAction(state, { type: "add_child", parentId: root, topic }).ids[0]
    );
    expect(state.blocks[root].mapLayout).toMatchObject({ family: "hierarchy", direction: "right", growthMode: "one-side" });

    // The user's own custom row layout, applied the way update_transform would.
    const customPositions: Record<string, { x: number; y: number }> = {
      [root]: { x: 0, y: 0 },
      [phases[0]]: { x: 400, y: 0 },
      [phases[1]]: { x: 400, y: 200 },
    };
    Object.entries(customPositions).forEach(([blockId, position]) => {
      state.blocks[blockId].transform = { computed: null, override: { ...blockRect(state.blocks[blockId]), ...position } };
    });

    // Re-issuing the identical layoutType (no family/direction/growthMode change).
    applyAgentAction(state, { type: "update_map_style", target: root, layoutType: "logical-right" });

    Object.entries(customPositions).forEach(([blockId, position]) => {
      const rect = blockRect(state.blocks[blockId]);
      expect(rect.x).toBe(position.x);
      expect(rect.y).toBe(position.y);
    });
  });

  it("normalizes the UI Treeview label to the catalog action id", () => {
    expect(normalizeAgentMapLayoutAction({ type: "update_map_style", layoutType: "treeview" })).toMatchObject({ layoutType: "catalog" });
    expect(normalizeAgentMapLayoutAction({ type: "update_map_style", layoutType: "outline" })).toMatchObject({ layoutType: "catalog" });
  });

  it("persists a map palette and materializes connector colors on the server path", () => {
    const state: AgentBoardState = {
      blocks: {
        root: { id: "root", parentId: undefined, mapLayout: { family: "hierarchy" } },
        child: { id: "child", parentId: "root" },
        leaf: { id: "leaf", parentId: "child" },
      },
      blockOrder: ["root", "child", "leaf"],
      connectors: {
        first: { id: "first", fromBlockId: "root", toBlockId: "child" },
        second: { id: "second", fromBlockId: "child", toBlockId: "leaf" },
      },
      title: "Test",
    };

    expect(applyServerMapPalette(state, { type: "update_map_style", connectorPaletteId: "vibrant" }, "root")).toBe(true);
    expect(state.blocks.root.mapLayout).toMatchObject({ connectorPaletteId: "vibrant", stylePresetId: "vibrant" });
    expect(state.connectors.first.strokeColor).toBe("#f43f5e");
    expect(state.connectors.second.strokeColor).toBe("#06b6d4");
  });

  it("lays out the complete nested tree before returning the board state", () => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const result = applyAgentAction(state, {
      type: "create_map",
      nodes: [{
        topic: "Personal assets",
        children: [
          { topic: "Cash", children: [{ text: "Wallet" }, { text: "Savings" }, { text: "Deposit" }] },
          { topic: "Investments", children: [{ text: "Stocks" }, { text: "Bonds" }, { text: "Funds" }] },
        ],
      }],
    });

    expect(result.ids).toHaveLength(9);
    const root = state.blocks[result.ids[0]];
    expect(root.mapLayout).toMatchObject({ family: "hierarchy", direction: "right" });

    const blocks = result.ids.map((id) => state.blocks[id]);
    blocks.forEach((block) => expect(block.transform.override).toBeNull());
    for (let left = 0; left < blocks.length; left += 1) {
      for (let right = left + 1; right < blocks.length; right += 1) {
        expect(overlaps(rect(blocks[left]), rect(blocks[right]))).toBe(false);
      }
    }

    expect(Object.values(state.connectors)).toHaveLength(8);
    expect(Object.values(state.connectors).every((connector) => connector.lineType === "curved")).toBe(true);
  });

  it.each([
    ["mindmap", "hierarchy", "both-side", "curved"],
    ["org-chart", "hierarchy", "one-side", "curved"],
    ["hierarchy", "hierarchy", "one-side", "curved"],
    ["treeview", "treeview", "one-side", "orthogonal"],
    ["catalog", "treeview", "one-side", "orthogonal"],
    ["timeline", "timeline", "one-side", "orthogonal"],
    ["fishbone", "fishbone", "one-side", "orthogonal"],
  ] as const)("preserves requested %s family instead of defaulting to hierarchy", (layoutType, family, growthMode, connectorLineType) => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const result = applyAgentAction(state, {
      type: "create_map",
      layoutType,
      nodes: [{ topic: "Root", children: [{ topic: "Child" }, { topic: "Second child" }] }],
    });

    expect(state.blocks[result.ids[0]].mapLayout).toMatchObject({ family, growthMode, connectorLineType });
    expect(Object.values(state.connectors).every((connector) => connector.lineType === connectorLineType)).toBe(true);
  });

  it("applies detailed tree-map options in the same create_map action", () => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const result = applyAgentAction(state, {
      type: "create_map",
      layoutType: "timeline",
      layoutDirection: "down",
      timelineBranchMode: "alternate",
      timelineDescendantStyle: "hierarchy",
      connectorPaletteId: "vibrant",
      connectionStyle: "curved",
      nodes: [{ topic: "Roadmap", children: [{ topic: "Launch" }, { topic: "Measure" }] }],
    });

    expect(state.blocks[result.ids[0]].mapLayout).toMatchObject({
      family: "timeline",
      direction: "down",
      connectorLineType: "orthogonal",
      connectorPaletteId: "vibrant",
      stylePresetId: "vibrant",
      timelineBranchMode: "alternate",
      timelineDescendantStyle: "hierarchy",
    });
  });

  it("accepts connector style only for the Hierarchy family", () => {
    const hierarchy: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const hierarchyResult = applyAgentAction(hierarchy, {
      type: "create_map", layoutType: "mindmap", connectionStyle: "straight", nodes: [{ topic: "Root", children: [{ topic: "Child" }] }],
    });
    expect(hierarchy.blocks[hierarchyResult.ids[0]].mapLayout?.connectorLineType).toBe("straight");

    // The editor has no separate org chart: it is Hierarchy growing Down, so it accepts a line style too.
    const orgChart: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const orgResult = applyAgentAction(orgChart, {
      type: "create_map", layoutType: "org-chart", connectionStyle: "orthogonal", nodes: [{ topic: "Root", children: [{ topic: "Child" }] }],
    });
    expect(orgChart.blocks[orgResult.ids[0]].mapLayout).toMatchObject({ family: "hierarchy", direction: "down", connectorLineType: "orthogonal" });

    const catalog: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const catalogResult = applyAgentAction(catalog, {
      type: "create_map", layoutType: "catalog", connectionStyle: "curved", nodes: [{ topic: "Root", children: [{ topic: "Child" }] }],
    });
    expect(catalog.blocks[catalogResult.ids[0]].mapLayout?.connectorLineType).toBe("orthogonal");
  });

  it("keeps flowchart and swimlane options separate from tree-map options", () => {
    const flowchart: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const flowResult = applyAgentAction(flowchart, {
      type: "create_flowchart",
      direction: "right",
      connectionStyle: "curved",
      connectorPaletteId: "pastel",
      nodes: [{ id: "start", label: "Start", role: "start" }, { id: "end", label: "End", role: "end" }],
      edges: [{ from: "start", to: "end" }],
    });
    expect(flowchart.blocks[flowResult.ids[0]].mapLayout).toMatchObject({ family: "flowchart", direction: "right", connectorLineType: "orthogonal", connectorPaletteId: "pastel" });
    expect(Object.values(flowchart.connectors).every((connector) => connector.lineType === "orthogonal")).toBe(true);

    const swimlane: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const swimResult = applyAgentAction(swimlane, {
      type: "create_swimlane",
      orientation: "vertical",
      connectorPaletteId: "minimal",
      lanes: [{ id: "sales", label: "Sales" }, { id: "ops", label: "Operations" }],
      nodes: [{ id: "a", label: "Qualify", laneId: "sales" }, { id: "b", label: "Fulfill", laneId: "ops" }],
      edges: [{ from: "a", to: "b" }],
    });
    expect(swimlane.blocks[swimResult.ids[0]].mapLayout).toMatchObject({ family: "swimlane", direction: "down", connectorLineType: "orthogonal", connectorPaletteId: "minimal" });
    expect(Object.values(swimlane.connectors).every((connector) => connector.lineType === "orthogonal")).toBe(true);
  });

  it("keeps a six-track flowchart on six rows even with cross-track dependency edges", () => {
    // Reproduces the large-map stress test: a goal plus six parallel
    // workstreams, each four sequential tasks + a checkpoint, tied together
    // by a handful of cross-track dependency edges. Every workstream must
    // stay on its own row (cross axis for a "right" flowchart); a
    // cross-track edge must never fragment a track across two rows.
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const trackCount = 6;
    const nodes: Array<{ id: string; label: string; role?: string }> = [{ id: "goal", label: "Goal" }];
    const edges: Array<{ from: string; to: string; label?: string }> = [];
    for (let track = 1; track <= trackCount; track += 1) {
      const stepIds = [1, 2, 3, 4].map((step) => `t${track}-task-${step}`);
      stepIds.forEach((stepId, index) => {
        nodes.push({ id: stepId, label: `Task ${index + 1}` });
      });
      nodes.push({ id: `t${track}-checkpoint`, label: "Checkpoint" });
      edges.push({ from: "goal", to: stepIds[0] });
      for (let index = 0; index < stepIds.length - 1; index += 1) {
        edges.push({ from: stepIds[index], to: stepIds[index + 1] });
      }
      edges.push({ from: stepIds[stepIds.length - 1], to: `t${track}-checkpoint` });
    }
    // Six cross-dependency edges, each reaching into the middle of another
    // track (not its start) — the shape that previously let a distant
    // cross-track hop "steal" a node from its own track's row.
    for (let track = 1; track <= trackCount; track += 1) {
      const nextTrack = (track % trackCount) + 1;
      edges.push({ from: `t${track}-task-2`, to: `t${nextTrack}-task-4`, label: "depends on" });
    }

    const result = applyAgentAction(state, {
      type: "create_flowchart",
      direction: "right",
      nodes,
      edges,
    });

    const rootId = result.ids[0];
    expect(state.blocks[rootId].mapLayout).toMatchObject({ family: "flowchart", direction: "right" });
    const crossPositions = new Set(
      Object.keys(state.blocks)
        .filter((blockId) => state.blocks[blockId].mapId === rootId || blockId === rootId)
        .map((blockId) => rect(state.blocks[blockId]).y),
    );
    expect(crossPositions.size).toBe(trackCount);

    // Every node originally requested inside one track must end up sharing a
    // single row with the rest of that track — none of the six rows may
    // contain nodes from two different tracks.
    const trackOfNode = new Map<string, number>();
    for (let track = 1; track <= trackCount; track += 1) {
      [1, 2, 3, 4].forEach((step) => trackOfNode.set(`t${track}-task-${step}`, track));
      trackOfNode.set(`t${track}-checkpoint`, track);
    }
    const semanticKeyOf = new Map<string, string>();
    Object.values(state.blocks).forEach((block) => {
      const key = (block.data as Record<string, unknown> | undefined)?.semanticKey;
      if (typeof key === "string") semanticKeyOf.set(String(block.id), key);
    });
    const rowByTrack = new Map<number, number>();
    Object.values(state.blocks).forEach((block) => {
      const semanticKey = semanticKeyOf.get(String(block.id));
      const track = semanticKey ? trackOfNode.get(semanticKey) : undefined;
      if (track === undefined) return;
      const y = rect(block).y;
      const existingRow = rowByTrack.get(track);
      if (existingRow === undefined) rowByTrack.set(track, y);
      else expect(y).toBe(existingRow);
    });
  });

  it("resolves update_relationship by the model's own node key even when labels repeat across tracks", () => {
    // Two tracks whose task labels are identical generic text ("Task 2");
    // resolveId's label match alone is ambiguous here (multiple blocks share
    // the same topic), so it must fall back to the model-assigned
    // semanticKey to find the right connector.
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const create = applyAgentAction(state, {
      type: "create_flowchart",
      direction: "right",
      nodes: [
        { id: "goal", label: "Goal" },
        { id: "a-1", label: "Task 1" }, { id: "a-2", label: "Task 2" },
        { id: "b-1", label: "Task 1" }, { id: "b-2", label: "Task 2" },
      ],
      edges: [
        { from: "goal", to: "a-1" }, { from: "a-1", to: "a-2" },
        { from: "goal", to: "b-1" }, { from: "b-1", to: "b-2" },
      ],
    });
    expect(create.ids.length).toBeGreaterThan(0);

    const result = applyAgentAction(state, {
      type: "update_relationship",
      between: { fromBlockId: "b-1", toBlockId: "b-2" },
      relationshipPatch: { lineLabel: "Track B ready" },
    });

    expect(result.ids).toHaveLength(1);
    const updated = Object.values(state.connectors).find((connector) => connector.id === result.ids[0]);
    expect(updated).toMatchObject({ label: "Track B ready" });
    // The a-1 -> a-2 connector (same labels, different track) must be untouched.
    const untouched = Object.values(state.connectors).find((connector) => {
      const from = state.blocks[String(connector.fromBlockId)];
      const to = state.blocks[String(connector.toBlockId)];
      return (from?.data as Record<string, unknown> | undefined)?.semanticKey === "a-1"
        && (to?.data as Record<string, unknown> | undefined)?.semanticKey === "a-2";
    });
    expect(untouched?.label).toBeUndefined();
  });

  it("reports create_flowchart's actual persisted connectors, including edges dropped for an unknown endpoint", () => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
    const result = applyAgentAction(state, {
      type: "create_flowchart",
      direction: "right",
      nodes: [{ id: "start", label: "Start" }, { id: "end", label: "End" }],
      edges: [
        { from: "start", to: "end" },
        // References a node key that was never sent in this call; silently
        // dropped by create_flowchart, but the receipt must not claim it was
        // created.
        { from: "start", to: "missing-node" },
      ],
    });

    expect(Object.keys(state.connectors)).toHaveLength(1);
    const reportedConnectorIds = result.ids.filter((resultId) => Boolean(state.connectors[resultId]));
    expect(reportedConnectorIds).toHaveLength(1);
    expect(reportedConnectorIds[0]).toBe(Object.keys(state.connectors)[0]);
  });
});
