// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { applyWorkspaceChatDiagramAction } from "@/app/workspace/utils/workspaceChatDiagramActions";
import { useWorkspaceStore } from "@/app/workspace/store/useWorkspaceStore";
import { createComputedTransform, type CanvasBlock } from "@/app/workspace/types/block";

function textBlock(id: string, label: string, mapId: string): CanvasBlock {
  return {
    id,
    mapId,
    type: "text",
    transform: createComputedTransform({ x: 80, y: 80, w: 220, h: 82, rotation: 0, zIndex: 1 }),
    data: { markdown: label, semanticKey: id },
    createdAt: 1,
    updatedAt: 1,
  } as CanvasBlock;
}

describe("Workspace AI flowchart extension", () => {
  beforeEach(() => {
    const root = textBlock("root", "Start", "map-1");
    root.mapLayout = {
      family: "flowchart",
      direction: "down",
      growthMode: "one-side",
      connectorLineType: "orthogonal",
      connectorPaletteId: "default",
      timelineBranchMode: "auto",
      timelineDescendantStyle: "tree",
      catalogDescendantStyle: "tree",
    };
    const next = textBlock("next", "Next", "map-1");
    useWorkspaceStore.setState({
      blocks: { root, next },
      blockOrder: ["root", "next"],
      connectors: { link: { id: "link", fromBlockId: "root", toBlockId: "next", lineType: "orthogonal", arrowEnd: true } },
      selectedBlockIds: [],
    });
  });

  it("adds only new nodes and edges to the existing flowchart", () => {
    const ids = applyWorkspaceChatDiagramAction({
      type: "extend_flowchart",
      target: { mode: "id", id: "root" },
      nodes: [{ id: "end", label: "End", role: "end" }],
      edges: [{ from: "next", to: "end", label: "Done" }],
    });

    expect(ids).toHaveLength(2);
    const state = useWorkspaceStore.getState();
    expect(Object.values(state.blocks).map((block) => block.data.markdown)).toEqual(expect.arrayContaining(["Start", "Next", "End"]));
    expect(Object.values(state.connectors)).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromBlockId: "next", lineType: "orthogonal", label: "Done" }),
    ]));
    expect(state.blocks.root.mapLayout?.family).toBe("flowchart");
  });
});
