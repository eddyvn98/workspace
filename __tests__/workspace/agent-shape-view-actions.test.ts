import { describe, expect, it } from "vitest";
import { validateWorkspaceRuntimeAction } from "@/lib/workspace-agent/actionSchema";

describe("Workspace shape, freehand and view contracts", () => {
  it("bounds shape styles and requires explicit targets for edits", () => {
    expect(validateWorkspaceRuntimeAction({ type: "create_shape", shapeType: "rectangle", style: { backgroundColor: "#fff" } })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "create_shape", style: { position: "fixed" } })).not.toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "update_shape", shapeId: "shape-1", text: "Label" })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "delete_shape" })).toContain("requires a blockId");
    expect(validateWorkspaceRuntimeAction({ type: "update_shape", target: "shape-1" })).toContain("at least one field");
  });

  it("requires bounded points to create freehand strokes", () => {
    expect(validateWorkspaceRuntimeAction({ type: "create_freehand", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "create_freehand", points: [{ x: 1, y: 2 }] })).not.toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "create_freehand", points: [{ x: Infinity, y: 2 }, { x: 3, y: 4 }] })).not.toBeNull();
  });

  it("checks view-mode inputs and selection-frame targets", () => {
    expect(validateWorkspaceRuntimeAction({ type: "focus_view", mode: "zoom" })).toContain("requires zoom or factor");
    expect(validateWorkspaceRuntimeAction({ type: "focus_view", mode: "zoom", factor: 1.2 })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "focus_view", mode: "pan", dx: 20 })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "wrap_blocks_in_frame", scope: "selection" })).toContain("requires block targets");
    expect(validateWorkspaceRuntimeAction({ type: "wrap_blocks_in_frame", blockIds: ["a", "b"], movable: true })).toBeNull();
  });
});
