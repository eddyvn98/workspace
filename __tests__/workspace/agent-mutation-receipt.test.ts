import { describe, expect, it } from "vitest";
import { agentMutationReceipt } from "@/app/api/workspaces/[id]/agent/routeHelpers";

describe("agentMutationReceipt", () => {
  it("reports text formatting stored on data alongside style colors", () => {
    const board = {
      blocks: [{ id: "a", type: "text", data: { markdown: "Hi", fontWeight: "bold", fontSize: 24 }, style: { backgroundColor: "#FFF2CC" } }],
      connectors: [],
      frames: [],
    };
    const receipt = agentMutationReceipt(board as never, [{ type: "update_style", ids: ["a"], changed: true }], []);
    const style = (receipt.changedBlocks as Array<{ style: Record<string, unknown> }>)[0].style;
    expect(style).toMatchObject({ fontWeight: "bold", fontSize: 24, backgroundColor: "#FFF2CC" });
  });
});
