// @vitest-environment node

import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";

describe("Workspace arrange_selection", () => {
  it("honors numeric string columns from tool payloads", () => {
    const board: AgentBoardState = {
      blocks: {
        first: { id: "first", transform: { override: { x: 1160, y: 297, w: 164, h: 48 } } },
        second: { id: "second", transform: { override: { x: 1160, y: 395, w: 164, h: 48 } } },
      },
      blockOrder: ["first", "second"],
      connectors: {},
      title: "Arrange selection test",
    };

    const result = applyAgentAction(board, {
      type: "arrange_selection",
      blockIds: ["first", "second"],
      mode: "catalog",
      columns: "1",
      gap: "80",
    });

    expect(result.ids).toEqual(["first", "second"]);
    expect(board.blocks.first.transform.override).toMatchObject({ x: 1160, y: 297 });
    expect(board.blocks.second.transform.override).toMatchObject({ x: 1160, y: 425 });
  });
});
