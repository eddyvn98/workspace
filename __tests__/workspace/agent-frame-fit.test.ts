import { describe, expect, it } from "vitest";
import { applyFrameAction } from "@/app/api/workspaces/[id]/agent/frameOperations";

const blk = (id: string, x: number, y: number, parentId?: string) => ({ id, parentId, data: { markdown: id.toUpperCase() }, transform: { override: { x, y, w: 200, h: 100 } } });
const state = () => ({
  blocks: { root: blk("root", 1000, 1000), child: blk("child", 1400, 1000, "root"), far: blk("far", -5000, -5000) },
  frames: [] as Array<Record<string, unknown>>,
});

describe("frame camera fitting", () => {
  it("fits a named map root including its descendants", () => {
    const s = state();
    expect(applyFrameAction(s, { type: "create_frame", name: "Phase 1", blockIds: ["root"] }, "create_frame")).toBe(true);
    const cam = (s.frames[0] as { camera: { x: number; y: number; zoom: number } }).camera;
    // Visible canvas centre (1100..1600 span) must map near the viewport centre.
    expect(Math.abs((1300 * cam.zoom + cam.x) - 720)).toBeLessThan(1);
    expect(cam.zoom).toBeGreaterThan(0.5);
  });

  it("accepts a block label instead of an id", () => {
    const s = state();
    expect(applyFrameAction(s, { type: "create_frame", name: "By label", blockIds: ["ROOT"] }, "create_frame")).toBe(true);
    const cam = (s.frames[0] as { camera: { x: number; zoom: number } }).camera;
    expect(Math.abs((1300 * cam.zoom + cam.x) - 720)).toBeLessThan(1);
  });

  it("reads block ids tucked inside camera and never stores them as the view", () => {
    const s = state();
    expect(applyFrameAction(s, { type: "create_frame", name: "Hint", camera: { blockIds: ["root"] } }, "create_frame")).toBe(true);
    const cam = (s.frames[0] as { camera: Record<string, unknown> }).camera;
    expect(cam).not.toHaveProperty("blockIds");
    expect(Number.isFinite(Number(cam.x)) && Number(cam.zoom) > 0).toBe(true);
  });

  it("refuses a frame around blocks that do not exist", () => {
    const s = state();
    expect(applyFrameAction(s, { type: "create_frame", name: "X", blockIds: ["nope"] }, "create_frame")).toBe(false);
  });

  it("renaming a frame keeps its camera", () => {
    const s = state();
    s.frames = [{ id: "f1", name: "A", order: 0, camera: { x: 5, y: 6, zoom: 2 } }];
    applyFrameAction(s, { type: "update_frame", frameId: "f1", name: "B" }, "update_frame");
    expect(s.frames[0]).toMatchObject({ name: "B", camera: { x: 5, y: 6, zoom: 2 } });
  });
});
