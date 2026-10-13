import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";

describe("AI block creation style parity", () => {
  it.each(["cloud", "diamond", "triangle", "hexagon"])("preserves %s and text formatting in the first create command", (shapeKind) => {
    const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {} };
    const result = applyAgentAction(state, {
      type: "create_block", blockType: "text", text: "Styled text",
      style: { shapeKind, backgroundColor: "#ffeeaa", textColor: "#123456", fontSize: 24, align: "left" },
    });
    const block = state.blocks[result.ids[0]];
    expect(block.type).toBe("text");
    expect(block.style).toMatchObject({ shapeKind, backgroundColor: "#ffeeaa", textColor: "#123456" });
    expect(block.data).toMatchObject({ markdown: "Styled text", fontSize: 24, align: "left" });
  });
});

describe("image and icon proposal schemas", () => {
  it("accepts supported image updates and rejects empty or unknown fields", () => {
    const valid = JSON.stringify({ done: false, message: "Updated.", actions: [
      { type: "update_image", blockId: "b1", images: [{ url: "https://example.com/a.png", alt: "Preview" }] },
      { type: "update_icon", blockId: "b1", icon: "lightbulb" },
    ] });
    expect(parseWorkspaceModelProposal(valid).actions).toHaveLength(2);
    const empty = JSON.stringify({ done: false, message: "Updated.", actions: [{ type: "update_image", blockId: "b1" }] });
    expect(() => parseWorkspaceModelProposal(empty)).toThrow(/requires image/);
    const extra = JSON.stringify({ done: false, message: "Updated.", actions: [{ type: "update_icon", blockId: "b1", icon: "lightbulb", unexpected: true }] });
    expect(() => parseWorkspaceModelProposal(extra)).toThrow(/unsupported fields/);
  });
});
