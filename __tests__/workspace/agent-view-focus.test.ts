// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { readAgentViewFocus } from "@/app/workspace/utils/workspaceAgentViewFocus";

function board() {
  const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "View", camera: { x: 0, y: 0, zoom: 1, activeFrameId: null } } as AgentBoardState;
  const ids = ["Left", "Right"].map((text, index) => applyAgentAction(state, { type: "create_block", blockType: "text", data: { text }, transform: { x: index * 2000, y: 0, w: 200, h: 100 } }).ids[0]);
  return { state, ids };
}
const camera = (state: AgentBoardState) => state.camera as { x: number; y: number; zoom: number; focus?: { seq: number; mode: string; blockIds: string[] } };

describe("AI focus_view", () => {
  it("fits the whole board and persists the camera with a focus sequence", () => {
    const { state } = board();
    expect(applyAgentAction(state, { type: "focus_view", mode: "fit" }).ids).toEqual(["camera"]);
    expect(camera(state).zoom).toBeLessThan(1);
    expect(camera(state).focus).toMatchObject({ seq: 1, mode: "fit", blockIds: [] });
    applyAgentAction(state, { type: "focus_view" });
    expect(camera(state).focus?.seq).toBe(2);
  });

  it("focuses named blocks (id or unique label), selects them and centres on them", () => {
    const { state, ids } = board();
    const result = applyAgentAction(state, { type: "focus_view", mode: "focus", blockIds: [ids[1]], zoom: 1 });
    expect(result.ids).toEqual([ids[1]]);
    const view = camera(state);
    expect(view.zoom).toBe(1);
    const t = (state.blocks[ids[1]] as unknown as { transform: { override: { x: number; w: number } } }).transform.override;
    expect(720 - view.x).toBeCloseTo(t.x + t.w / 2, 0);
    expect(view.focus?.blockIds).toEqual([ids[1]]);
    applyAgentAction(state, { type: "focus_view", target: "Left", select: false });
    expect(camera(state).focus?.blockIds).toEqual([]);
  });

  it("selects a block named by its unique label, not just by id", () => {
    const { state, ids } = board();
    applyAgentAction(state, { type: "focus_view", mode: "focus", target: "Right" });
    expect(camera(state).focus?.blockIds).toEqual([ids[1]]);
  });

  it("selects blocks independently of the framing with selectBlockIds", () => {
    const { state, ids } = board();
    applyAgentAction(state, { type: "focus_view", mode: "fit", selectBlockIds: ["Right"] });
    expect(camera(state).focus).toMatchObject({ mode: "fit", blockIds: [ids[1]] });
    expect(camera(state).zoom).toBeLessThan(1);
    applyAgentAction(state, { type: "focus_view", mode: "zoom", zoom: 2, selectBlockIds: [ids[0]] });
    expect(camera(state).focus?.blockIds).toEqual([ids[0]]);
  });

  it("records the framing set separately from the selection", () => {
    const { state, ids } = board();
    applyAgentAction(state, { type: "focus_view", mode: "fit", selectBlockIds: ["Right"] });
    expect(camera(state).focus).toMatchObject({ blockIds: [ids[1]] });
    expect((camera(state).focus as { fitIds?: string[] }).fitIds).toBeUndefined();
    applyAgentAction(state, { type: "focus_view", mode: "focus", blockIds: [ids[0]], select: false });
    expect(camera(state).focus).toMatchObject({ blockIds: [], fitIds: [ids[0]] });
  });

  it("zooms absolutely and relatively around the centre, clamped, and pans in canvas units", () => {
    const { state } = board();
    applyAgentAction(state, { type: "focus_view", mode: "zoom", zoom: 2 });
    expect(camera(state).zoom).toBe(2);
    applyAgentAction(state, { type: "focus_view", mode: "zoom", factor: 0.5 });
    expect(camera(state).zoom).toBe(1);
    applyAgentAction(state, { type: "focus_view", mode: "zoom", zoom: 99 });
    expect(camera(state).zoom).toBe(3);
    const before = { ...camera(state) };
    applyAgentAction(state, { type: "focus_view", mode: "pan", dx: 100, dy: -50 });
    expect(camera(state).x).toBeCloseTo(before.x - 100 * before.zoom);
    expect(camera(state).y).toBeCloseTo(before.y + 50 * before.zoom);
  });

  it("rejects unknown blocks, unknown modes and empty pans without changing the camera", () => {
    const { state } = board();
    const before = JSON.stringify(state.camera);
    expect(applyAgentAction(state, { type: "focus_view", mode: "focus", blockIds: ["missing"] }).ids).toEqual([]);
    expect(applyAgentAction(state, { type: "focus_view", mode: "spin" }).ids).toEqual([]);
    expect(applyAgentAction(state, { type: "focus_view", mode: "pan" }).ids).toEqual([]);
    expect(JSON.stringify(state.camera)).toBe(before);
  });

  it("exposes the focus request to the client only when it carries a sequence", () => {
    expect(readAgentViewFocus({ x: 0, y: 0, zoom: 1 })).toBeNull();
    expect(readAgentViewFocus({ focus: { seq: 3, blockIds: ["a"] } })).toMatchObject({ seq: 3 });
  });
});
