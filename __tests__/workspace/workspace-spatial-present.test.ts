// @vitest-environment node
import { expect, it } from "vitest";
import { planSpatialLayout } from "@/app/workspace/utils/spatialLayout";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";
const block = (id: string, x: number, w: number) => ({ id, type: "shape", data: { label: id }, transform: { override: { x, y: 0, w, h: 100, rotation: 0, zIndex: 0 } } });
const board = (): AgentBoardState => ({ title: "t", blocks: { a: block("a", 0, 100), b: block("b", 10, 200), c: block("c", 20, 300), d: block("d", 30, 50) }, blockOrder: ["a", "b", "c", "d"], connectors: {}, frames: [] });
it("heterogeneous grid cells use column maxima and row maxima instead of each item size", () => {
  const positions = planSpatialLayout([{ id: "a", x: 0, y: 0, w: 400, h: 300 }, { id: "b", x: 0, y: 0, w: 100, h: 50 }, { id: "c", x: 0, y: 0, w: 50, h: 80 }, { id: "d", x: 0, y: 0, w: 250, h: 100 }], "grid", 32, 2)!;
  expect(positions.get("b")).toEqual({ x: 432, y: 0 });
  expect(positions.get("c")).toEqual({ x: 0, y: 332 });
  expect(positions.get("d")).toEqual({ x: 432, y: 332 });
});
it("AI and manual spatial plans agree; locked selection and invalid modes do not mutate", () => {
  const state = board(); const moved = applyAgentAction(state, { type: "arrange_selection", blockIds: ["a", "b", "c", "d"], mode: "grid", columns: 2, gap: 32 });
  expect(moved.ids).toHaveLength(4); expect(state.blocks.d.transform.override.x).toBe(332);
  state.blocks.b.style = { isLocked: true }; const before = structuredClone(state);
  expect(applyAgentAction(state, { type: "arrange_selection", blockIds: ["a", "b"], mode: "row" }).ids).toEqual([]);
  expect(applyAgentAction(state, { type: "update_transform", blockId: "b", x: 999 }).reason).toContain("locked");
  expect(state).toEqual(before);
  expect(applyAgentAction(state, { type: "update_style", target: "b", style: { isLocked: "false" } }).ids).toEqual([]);
  expect(applyAgentAction(state, { type: "update_style", target: "b", style: { isLocked: false } }).ids).toEqual(["b"]);
  expect(applyAgentAction(state, { type: "update_transform", blockId: "b", x: 999 }).ids).toEqual(["b"]);
  const saved = structuredClone(state);
  expect(applyAgentAction(state, { type: "arrange_selection", blockIds: ["a", "b"], mode: "unknown" }).ids).toEqual([]); expect(state).toEqual(saved);
});
it("presentation requests validate visibility and travel as camera focus metadata", () => {
  const state = board(); state.blocks.deck = { id: "deck", type: "slideDeck", data: { slideOrder: ["s", "hidden"], slides: { s: { id: "s", html: "<p>Visible</p>" }, hidden: { id: "hidden", hidden: true, html: "<p>Hidden</p>" } } } };
  expect(applyAgentAction(state, { type: "focus_view", mode: "present", blockId: "deck" }).ids).toEqual(["deck"]);
  expect(state.camera).toMatchObject({ focus: { mode: "present", presentation: "slides", blockIds: ["deck"] } });
  const camera = structuredClone(state.camera);
  expect(applyAgentAction(state, { type: "focus_view", mode: "present", blockId: "deck", slideId: "hidden" }).ids).toEqual([]); expect(state.camera).toEqual(camera);
  state.frames = [{ id: "f", name: "Intro", camera: { x: 0, y: 0, zoom: 1 }, order: 0 }];
  expect(applyAgentAction(state, { type: "focus_view", mode: "present", frameId: "f" }).ids).toEqual(["f"]);
  expect(state.camera).toMatchObject({ focus: { presentation: "frames", frameId: "f" } });
});
it.each([{ frameId: "frame-1" }, { frameName: "Intro" }])("accepts frame-targeted presentation through runtime proposal validation: %o", (target) => {
  const action = { type: "focus_view", mode: "present", ...target };
  const proposal = JSON.stringify({ done: false, message: "Starting presentation.", actions: [action] });
  expect(parseWorkspaceModelProposal(proposal).actions).toEqual([action]);
});
it("still requires a slide or frame target for presentation", () => {
  const proposal = JSON.stringify({ done: false, message: "Starting presentation.", actions: [{ type: "focus_view", mode: "present" }] });
  expect(() => parseWorkspaceModelProposal(proposal)).toThrow(/requires a slide-deck blockId, target, or frameId\/frameName/);
});
