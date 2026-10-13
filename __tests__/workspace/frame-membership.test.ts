import { describe, expect, it } from "vitest";
import { planFrameDrop, addContainerMembers, fitContainerToContents } from "@/app/workspace/utils/frameMembership";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
const at = (id: string, x: number, y: number, w = 100, h = 80, data = {}, type = "shape") => ({ id, type, data, transform: { override: { x, y, w, h, rotation: 0, zIndex: 1 } } });
function board(): AgentBoardState {
  return { title: "Containers", blockOrder: ["outer", "inner", "note"], connectors: {}, blocks: {
    outer: at("outer", 0, 0, 800, 600, { label: "Outer", frameBlockIds: ["inner"] }),
    inner: at("inner", 100, 100, 300, 250, { label: "Inner", frameBlockIds: [] }),
    note: at("note", 1000, 100, 100, 80, { label: "Note" }),
  } };
}
describe("frame membership", () => {
  it("captures in the smallest frame and releases only the moved block", () => {
    const s = board(); s.blocks.note.transform.override.x = 150;
    expect([...planFrameDrop(s.blocks, ["note"])]).toEqual([["inner", ["note"]]]);
    s.blocks.inner.data.frameBlockIds = ["note", "other"];
    s.blocks.note.transform.override.x = 950;
    expect([...planFrameDrop(s.blocks, ["note"])]).toEqual([["inner", ["other"]]]);
  });
  it("moving to another frame transfers ownership instead of moving with both", () => {
    const s = board(); s.blocks.inner.data.frameBlockIds = ["note"];
    s.blocks.note.transform.override.x = 600;
    expect([...planFrameDrop(s.blocks, ["note"])]).toEqual([["inner", []], ["outer", ["inner", "note"]]]);
  });
  it("carried members, tree children, locks and disabled capture stay intact", () => {
    const s = board(); s.blocks.inner.data.frameBlockIds = ["note"];
    expect(planFrameDrop(s.blocks, ["outer", "inner", "note"]).size).toBe(0);
    s.blocks.inner.style = { isLocked: true }; expect(planFrameDrop(s.blocks, ["note"]).size).toBe(0);
    delete s.blocks.inner.style; s.blocks.inner.data.frameAutoMembership = false;
    expect(planFrameDrop(s.blocks, ["note"]).size).toBe(0);
    s.blocks.note.parentId = "outer"; s.blocks.inner.data.frameBlockIds = [];
    expect(planFrameDrop(s.blocks, ["note"]).size).toBe(0);
  });
  it("prevents cycles and overlapping nested frames, and supports rotated frame centers", () => {
    const s = board(); expect(addContainerMembers(s.blocks, "inner", ["outer"])).toBeUndefined();
    expect(planFrameDrop(s.blocks, ["outer"]).size).toBe(0);
    s.blocks.inner.transform.override.rotation = 90;
    s.blocks.note.transform.override = { x: 160, y: 140, w: 20, h: 20 };
    expect(planFrameDrop(s.blocks, ["note"]).get("inner")).toEqual(["note"]);
  });
  it("fit changes bounds without moving contents", () => {
    const s = board(); s.blocks.inner.data.frameBlockIds = ["note"];
    expect(fitContainerToContents(s.blocks, "inner", 20)).toEqual({ x: 980, y: 80, w: 140, h: 120 });
    expect(s.blocks.note.transform.override.x).toBe(1000);
  });
  it("uses the same rules for AI moves and keeps nested movement single", () => {
    const s = board();
    const joined = applyAgentAction(s, { type: "update_transform", target: "note", transform: { x: 150 } });
    expect(joined.ids).toContain("inner"); expect(s.blocks.inner.data.frameBlockIds).toEqual(["note"]);
    applyAgentAction(s, { type: "update_transform", target: "outer", transform: { x: 50 } });
    expect(s.blocks.note.transform.override.x).toBe(200);
    expect(s.blocks.inner.transform.override.x).toBe(150);
    expect(s.blocks.inner.data.frameBlockIds).toEqual(["note"]);
    applyAgentAction(s, { type: "update_transform", target: "note", transform: { x: 1000 } });
    expect(s.blocks.inner.data.frameBlockIds).toEqual([]);
  });
  it("AI fit/add/remove/release/configure validates before changing state", () => {
    const s = board(), run = (mode: string, extra = {}) => applyAgentAction(s, { type: "wrap_blocks_in_frame", frameId: "inner", mode, ...extra });
    expect(run("add", { blockIds: ["outer"] }).reason).toContain("ancestor");
    expect(run("add", { blockIds: ["note", "missing"] }).ids).toEqual([]);
    expect(run("add", { blockIds: ["note"] }).ids).toEqual(["inner"]);
    expect(run("fit", { padding: 20 }).ids).toEqual(["inner"]);
    expect(s.blocks.inner.transform.override.x).toBe(980);
    expect(run("configure", { autoMembership: false }).ids).toEqual(["inner"]);
    expect(s.blocks.inner.data.frameAutoMembership).toBe(false);
    expect(run("remove", { blockIds: ["note"] }).ids).toEqual(["inner"]);
    run("add", { blockIds: ["note"] }); run("release");
    expect(s.blocks.inner.data.frameBlockIds).toEqual([]); expect(s.blocks.note).toBeDefined();
  });
});
