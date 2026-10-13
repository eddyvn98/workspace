import { describe, expect, it } from "vitest";
import { validateWorkspaceRuntimeAction } from "@/lib/workspace-agent/actionSchema";

describe("Workspace slide action contracts", () => {
  it("bounds deck construction and rejects malformed slide content shapes", () => {
    expect(validateWorkspaceRuntimeAction({ type: "create_slide_deck", slides: [{ layout: "title", title: "Overview" }] })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "create_slide_deck", slides: [] })).not.toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "create_slide_deck", slides: [{}] })).toContain("non-empty slide objects");
    expect(validateWorkspaceRuntimeAction({ type: "create_slide_deck", slides: [{ layout: "title", rogueField: "ignored by executor" }] })).not.toBeNull();
  });

  it("requires selectors and meaningful edit/order payloads", () => {
    expect(validateWorkspaceRuntimeAction({ type: "delete_slide", blockId: "deck" })).toContain("requires a slideId");
    expect(validateWorkspaceRuntimeAction({ type: "update_slide", blockId: "deck", slideId: "one" })).toContain("at least one slide field");
    expect(validateWorkspaceRuntimeAction({ type: "update_slide", blockId: "deck", slideId: "one", backgroundColor: "#fff" })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "reorder_slides", blockId: "deck", slideOrder: ["one", "one"] })).toContain("unique slide identifiers");
    expect(validateWorkspaceRuntimeAction({ type: "add_slide", blockId: "deck", copy: true })).toContain("requires a source slideId");
  });

  it("keeps bulk edits bounded and requires at least one operation", () => {
    expect(validateWorkspaceRuntimeAction({ type: "update_slides", blockId: "deck" })).toContain("requires an update");
    expect(validateWorkspaceRuntimeAction({ type: "update_slides", blockId: "deck", insert: [{ layout: "title", title: "Next", position: 2 }] })).toBeNull();
    expect(validateWorkspaceRuntimeAction({ type: "update_slides", blockId: "deck", insert: [{}] })).toContain("non-empty slide objects");
    expect(validateWorkspaceRuntimeAction({ type: "update_slide_deck", blockId: "deck" })).toContain("requires at least one deck field");
    expect(validateWorkspaceRuntimeAction({ type: "update_slide_deck", blockId: "deck", applyToAll: true, backgroundColor: "#fff" })).toBeNull();
  });
});
