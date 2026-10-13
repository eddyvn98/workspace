// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { blockRect } from "@/app/api/workspaces/[id]/agent/operationsCore";

const branches = ["Vocabulary", "Speaking", "Listening", "Grammar"];

function build(layoutType: string, extra: object = {}) {
  const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "t" };
  const nodes = [{ topic: "Learning English", children: branches.map((topic) => ({ topic, children: [{ topic: `${topic} 1` }, { topic: `${topic} 2` }] })) }];
  const rootId = applyAgentAction(state, { type: "create_map", layoutType, nodes, ...extra }).ids[0];
  return { state, rootId };
}

function report(state: AgentBoardState, rootId: string) {
  const rect = (id: string) => blockRect(state.blocks[id]);
  const root = rect(rootId);
  const firstLevel = Object.values(state.blocks).filter((b) => b.parentId === rootId).map((b) => rect(String(b.id)));
  const all = Object.values(state.blocks).filter((b) => String(b.id) !== rootId).map((b) => rect(String(b.id)));
  const rootCenter = root.y + root.h / 2;
  const firstCenters = firstLevel.map((r) => r.y + r.h / 2);
  const top = Math.min(...all.map((r) => r.y));
  const bottom = Math.max(...all.map((r) => r.y + r.h));
  const left = firstLevel.filter((r) => r.x < root.x);
  const right = firstLevel.filter((r) => r.x > root.x);
  return {
    rootCenter,
    bboxCenter: (top + bottom) / 2,
    firstMid: (Math.min(...firstCenters) + Math.max(...firstCenters)) / 2,
    sides: [left.length, right.length],
  };
}

describe("map root placement on creation", () => {
  it("mindmap (both sides): the root sits at the vertical centre of its branches and keeps its anchor", () => {
    const { state, rootId } = build("mindmap");
    const r = report(state, rootId);
    expect(r.sides).toEqual([2, 2]);
    expect(Math.abs(r.rootCenter - r.firstMid)).toBeLessThan(2);
    expect(Math.abs(r.rootCenter - r.bboxCenter)).toBeLessThan(2);
    expect(blockRect(state.blocks[rootId])).toMatchObject({ x: 80, y: 80 });
  });

  it("creating and converting a map only produces parent-to-child connectors", () => {
    const { state, rootId } = build("mindmap");
    for (const layoutType of ["fishbone", "timeline", "org-chart", "catalog", "mindmap"]) {
      applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType });
    }
    const connectors = Object.values(state.connectors);
    expect(connectors).toHaveLength(12);
    expect(connectors.every((c) => state.blocks[String(c.toBlockId)]?.parentId === c.fromBlockId)).toBe(true);
  });

  it("logical-right (one side): the root sits at the centre of its first-level branches", () => {
    const { state, rootId } = build("logical-right");
    const r = report(state, rootId);
    expect(Math.abs(r.rootCenter - r.firstMid)).toBeLessThan(2);
  });

  it("converting an existing map keeps the root centred between its branches", () => {
    const { state, rootId } = build("logical-right");
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "mindmap" });
    const r = report(state, rootId);
    expect(r.sides).toEqual([2, 2]);
    expect(Math.abs(r.rootCenter - r.firstMid)).toBeLessThan(2);
  });
});

describe("arrange_selection over a whole map", () => {
  it("changes the map layout instead of scattering blocks and chaining extra connectors", () => {
    const { state, rootId } = build("mindmap");
    const ids = Object.keys(state.blocks);
    const before = Object.keys(state.connectors).length;
    applyAgentAction(state, { type: "arrange_selection", blockIds: ids, mode: "fishbone" });
    expect((state.blocks[rootId].mapLayout as { family: string }).family).toBe("fishbone");
    // Only the fishbone spine is new; no sibling-chaining connectors appear.
    expect(Object.keys(state.connectors)).toHaveLength(before + 1);
    expect(state.connectors[`${rootId}-fishbone-backbone`]).toBeTruthy();
  });

  it("still arranges loose blocks that are not a whole map", () => {
    const { state, rootId } = build("mindmap");
    state.blocks.x = { id: "x", type: "text", transform: { computed: null, override: { x: 0, y: 0, w: 100, h: 50, zIndex: 1 } }, data: { markdown: "x" } };
    state.blocks.y = { id: "y", type: "text", transform: { computed: null, override: { x: 300, y: 0, w: 100, h: 50, zIndex: 1 } }, data: { markdown: "y" } };
    state.blockOrder.push("x", "y");
    const { ids } = applyAgentAction(state, { type: "arrange_selection", blockIds: ["x", "y"], mode: "timeline" });
    expect(ids).toContain("x");
    expect((state.blocks[rootId].mapLayout as { family: string }).family).toBe("hierarchy");
  });
});

describe("map nodes fit their content", () => {
  it("sizes each node to its text and keeps the root centred between branches", () => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "t" };
    const nodes = [{ topic: "Learning English", children: [
      { topic: "Vocabulary", children: [{ topic: "Words" }, { topic: "Useful phrases for everyday conversations and travel" }] },
      { topic: "Speaking", children: [{ topic: "Pronunciation" }, { topic: "Conversation practice" }] },
      { topic: "Listening", children: [{ topic: "Podcasts" }, { topic: "Movies and music" }] },
      { topic: "Grammar", children: [{ topic: "Verb tenses" }, { topic: "Sentence structure" }] },
    ] }];
    const rootId = applyAgentAction(state, { type: "create_map", layoutType: "mindmap", nodes }).ids[0];
    const rects = Object.values(state.blocks).map((b) => ({ id: String(b.id), label: String((b.data as { markdown: string }).markdown), ...blockRect(b) }));
    const byLabel = (label: string) => rects.find((r) => r.label === label)!;
    // The long child sets the size of its whole level; shorter levels stay compact.
    expect(byLabel("Words").w).toBe(byLabel("Useful phrases for everyday conversations and travel").w);
    expect(byLabel("Words").h).toBeGreaterThan(byLabel("Vocabulary").h);
    expect(byLabel("Vocabulary").w).toBe(byLabel("Grammar").w);
    expect(byLabel("Vocabulary").w).toBeLessThan(byLabel("Words").w);
    expect(byLabel("Vocabulary").h).toBeLessThan(60);
    for (let a = 0; a < rects.length; a += 1) {
      for (let b = a + 1; b < rects.length; b += 1) {
        const l = rects[a]; const r = rects[b];
        expect(l.x < r.x + r.w && l.x + l.w > r.x && l.y < r.y + r.h && l.y + l.h > r.y).toBe(false);
      }
    }
    const report2 = report(state, rootId);
    expect(report2.sides).toEqual([2, 2]);
    expect(Math.abs(report2.rootCenter - report2.bboxCenter)).toBeLessThan(2);
  });
});

describe("map levels share one size", () => {
  it("gives every node of a level the same width and height, on both sides", () => {
    const { state, rootId } = build("mindmap");
    const depth = (id: string): number => (state.blocks[id].parentId ? 1 + depth(String(state.blocks[id].parentId)) : 0);
    const byDepth = new Map<number, Set<string>>();
    for (const block of Object.values(state.blocks)) {
      const rect = blockRect(block);
      const key = depth(String(block.id));
      byDepth.set(key, new Set([...(byDepth.get(key) ?? []), `${rect.w}x${rect.h}`]));
    }
    byDepth.forEach((sizes) => expect(sizes.size).toBe(1));
    expect(blockRect(state.blocks[rootId]).w).toBeGreaterThanOrEqual(96);
  });

  it("aligns columns: same-depth nodes on one side share their left edge", () => {
    const { state, rootId } = build("mindmap");
    const kids = Object.values(state.blocks).filter((b) => b.parentId === rootId).map((b) => blockRect(b));
    const rightSide = kids.filter((r) => r.x > blockRect(state.blocks[rootId]).x);
    expect(new Set(rightSide.map((r) => r.x)).size).toBe(1);
  });
});

describe("map connector sides", () => {
  it("links left-hand children to their parent's left edge and their own right edge", () => {
    const { state, rootId } = build("mindmap");
    const rootRect = blockRect(state.blocks[rootId]);
    const kids = Object.values(state.blocks).filter((b) => b.parentId === rootId);
    for (const kid of kids) {
      const connector = Object.values(state.connectors).find((c) => c.toBlockId === kid.id)!;
      const isLeft = blockRect(kid).x < rootRect.x;
      expect(connector.fromSide).toBe(isLeft ? "left" : "right");
      expect(connector.toSide).toBe(isLeft ? "right" : "left");
    }
  });

  it("keeps sides in step after the map is converted to another layout", () => {
    const { state, rootId } = build("mindmap");
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "org-chart" });
    const connector = Object.values(state.connectors).find((c) => c.fromBlockId === rootId)!;
    expect(["top", "bottom", undefined]).toContain(connector.fromSide);
  });
});

describe("fishbone backbone", () => {
  it("draws a spine from the root to the last category and removes it on conversion", () => {
    const { state, rootId } = build("mindmap");
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "fishbone" });
    const spine = state.connectors[`${rootId}-fishbone-backbone`] as { waypoints: Array<{ x: number; y: number }>; fromSide: string; lineOpacity: number; toBlockId: string };
    expect(spine).toBeTruthy();
    expect(spine.fromSide).toBe("right");
    expect(spine.waypoints).toHaveLength(2);
    expect(spine.waypoints[0].y).toBe(spine.waypoints[1].y);
    expect(spine.waypoints[1].x).toBeGreaterThanOrEqual(spine.waypoints[0].x);
    expect(state.blocks[spine.toBlockId].parentId).toBe(rootId);
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "mindmap" });
    expect(state.connectors[`${rootId}-fishbone-backbone`]).toBeUndefined();
    expect(Object.keys(state.connectors)).toHaveLength(12);
  });

  it("creates the spine when a map is created straight as a fishbone", () => {
    const { state, rootId } = build("fishbone");
    expect(state.connectors[`${rootId}-fishbone-backbone`]).toBeTruthy();
  });
});

describe("siblings keep the board order when a map is converted", () => {
  it("lays timeline milestones out left to right in blockOrder, so the rail never doubles back", () => {
    const { state, rootId } = build("mindmap");
    // Scramble the key order the way a database round trip can, leaving blockOrder untouched.
    state.blocks = Object.fromEntries(Object.entries(state.blocks).reverse());
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "timeline" });
    const milestones = state.blockOrder.filter((id) => state.blocks[id].parentId === rootId);
    const xs = milestones.map((id) => blockRect(state.blocks[id]).x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(xs.length);
  });

  it("keeps the same two branches on each side of a Both side map after other conversions", () => {
    const { state, rootId } = build("mindmap");
    const sideOf = (id: string) => (blockRect(state.blocks[id]).x < blockRect(state.blocks[rootId]).x ? "left" : "right");
    const before = Object.values(state.blocks).filter((b) => b.parentId === rootId).map((b) => [String(b.id), sideOf(String(b.id))]);
    state.blocks = Object.fromEntries(Object.entries(state.blocks).reverse());
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "treeview" });
    applyAgentAction(state, { type: "update_map_style", target: rootId, layoutType: "hierarchy", growthMode: "both-side" });
    expect(before.map(([id]) => [id, sideOf(id)])).toEqual(before);
  });
});
