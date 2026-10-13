// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { describeWorkspaceCapabilities } from "@/lib/workspace-command-capabilities";

function board(): AgentBoardState {
  return { title: "t", blocks: {}, blockOrder: [], connectors: {} };
}

describe("sticky notes", () => {
  it.each([
    ["blockType sticky_note", { type: "create_block", blockType: "sticky_note", data: { markdown: "Review" } }],
    ["block.type sticky", { type: "create_block", block: { type: "sticky", data: { markdown: "Review" } } }],
    ["shape with sticky kind", { type: "create_block", block: { type: "shape", shapeKind: "sticky_note", data: { label: "Review" } } }],
    ["create_shape", { type: "create_shape", shapeType: "sticky", text: "Review" }],
  ])("creates a yellow sticky shape from %s", (_name, action) => {
    const state = board();
    const { ids } = applyAgentAction(state, action);
    const block = state.blocks[ids[0]];
    expect(block.type).toBe("shape");
    expect(String((block.data as Record<string, unknown>).shapeKind)).toMatch(/sticky/);
    expect((block.data as Record<string, unknown>).label).toBe("Review");
    expect((block.style as Record<string, unknown>).backgroundColor).toBe("#fef08a");
  });

  it("keeps an explicit sticky color", () => {
    const state = board();
    const { ids } = applyAgentAction(state, { type: "create_shape", shapeType: "sticky_note", text: "x", style: { backgroundColor: "#fca5a5" } });
    expect((state.blocks[ids[0]].style as Record<string, unknown>).backgroundColor).toBe("#fca5a5");
  });

  it("still creates plain shapes through create_block", () => {
    const state = board();
    const { ids } = applyAgentAction(state, { type: "create_block", block: { type: "shape", shapeKind: "diamond", data: { label: "Go?" } } });
    expect(state.blocks[ids[0]].type).toBe("shape");
    expect((state.blocks[ids[0]].data as Record<string, unknown>).shapeKind).toBe("diamond");
  });
});

describe("whole-text emphasis", () => {
  it("promotes **text** to fontWeight bold", () => {
    const state = board();
    const { ids } = applyAgentAction(state, { type: "create_block", blockType: "text", data: { markdown: "**Title**" } });
    expect(state.blocks[ids[0]].data).toMatchObject({ markdown: "Title", fontWeight: "bold" });
  });

  it("leaves inline emphasis inside longer text alone", () => {
    const state = board();
    const { ids } = applyAgentAction(state, { type: "create_block", blockType: "text", data: { markdown: "Use **bold** inline" } });
    expect((state.blocks[ids[0]].data as Record<string, unknown>).markdown).toBe("Use **bold** inline");
  });
});

describe("capability guidance", () => {
  it("tells the model how to make sticky notes and what a frame is", () => {
    const text = JSON.stringify(describeWorkspaceCapabilities([]));
    expect(text).toContain("sticky_note");
    expect(text).toContain("camera view");
  });
});
