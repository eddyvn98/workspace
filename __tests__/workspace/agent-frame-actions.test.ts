import { describe, expect, it } from "vitest";
import { validateWorkspaceRuntimeAction } from "@/lib/workspace-agent/actionSchema";

describe("Workspace frame action contracts", () => {
  it("requires a usable saved view or resolvable content hints when creating a frame", () => {
    expect(validateWorkspaceRuntimeAction({ type: "create_frame" })).toContain("requires a finite camera");
    expect(validateWorkspaceRuntimeAction({ type: "create_frame", camera: { x: 0, y: 10, zoom: 1 } })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "create_frame", fitBlockIds: ["Quarterly results"] })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "create_frame", camera: { x: 0, y: 0, zoom: 0 } })).not.toBeNull();
  });

  it("requires frame selectors for edits and deletions", () => {
    expect(validateWorkspaceRuntimeAction({ type: "update_frame", name: "Opening" })).toContain("requires a frameId");
    expect(validateWorkspaceRuntimeAction({ type: "update_frame", frameName: "Opening", presenterNotes: "Introduce topic" })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "delete_frame", target: "frame-1" })).toBeNull();
  });

  it("requires a non-empty, bounded frame order", () => {
    expect(validateWorkspaceRuntimeAction({ type: "reorder_frames", frameIds: [] })).toContain("complete non-empty");
    expect(validateWorkspaceRuntimeAction({ type: "reorder_frames", frameIds: ["frame-1", "frame-2"] })).toBeNull();
  });
});
