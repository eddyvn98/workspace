// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { repairSemanticFlowchart } from "@/app/api/workspaces/[id]/agent/operationsDiagramLayout";
import { describeWorkspaceCapabilities } from "@/lib/workspace-command-capabilities";
import { workspaceActionReceiptSummary } from "@/lib/workspace-agent/receiptSummaries";
import type { WorkspaceBoardSnapshot } from "@/lib/workspace-agent/contracts";

describe("repair_connector identity", () => {
  it("exposes repair_connector in relationship capabilities", () => {
    const relationship = describeWorkspaceCapabilities(["relationship"])[0];
    const diagram = describeWorkspaceCapabilities(["diagram"])[0];

    expect(relationship.commands).toContain("repair_connector");
    expect(diagram.commands).toContain("repair_flowchart");
  });

  it("updates the selected connector when parallel links share endpoints and label", () => {
    const board: AgentBoardState = {
      blocks: {
        source: {
          id: "source",
          mapId: "map",
          mapLayout: { family: "flowchart", direction: "right" },
          transform: { override: { x: 80, y: 100, w: 180, h: 80, zIndex: 0 } },
        },
        destination: {
          id: "destination",
          mapId: "map",
          transform: { override: { x: 420, y: 100, w: 180, h: 80, zIndex: 0 } },
        },
      },
      blockOrder: ["source", "destination"],
      connectors: {
        first: {
          id: "first",
          fromBlockId: "source",
          toBlockId: "destination",
          label: "continue",
          waypoints: [{ x: 777, y: 777 }],
        },
        selected: {
          id: "selected",
          fromBlockId: "source",
          toBlockId: "destination",
          label: "continue",
          waypoints: [{ x: -999, y: -999 }],
        },
      },
      title: "Parallel connector repair",
    };
    const firstRoute = structuredClone(board.connectors.first.waypoints);

    const ids = repairSemanticFlowchart(board, { type: "repair_connector", connectorId: "selected" });

    expect(ids).toEqual(["selected"]);
    expect(board.connectors.selected.waypoints).not.toEqual([{ x: -999, y: -999 }]);
    expect(board.connectors.first.waypoints).toEqual(firstRoute);
  });

  it("returns a localized receipt naming the repaired connector endpoints", () => {
    const summary = workspaceActionReceiptSummary({
      actionType: "repair_connector",
      action: { connectorId: "selected", strategy: "reroute_only" },
      actionResult: {},
      language: "Vietnamese",
      targetIds: ["selected"],
      snapshot: {
        revision: 1,
        title: "Repair receipt",
        blocks: {
          source: { id: "source", title: "Source" },
          destination: { id: "destination", title: "Destination" },
        },
        blockOrder: ["source", "destination"],
        connectors: { selected: { id: "selected", fromBlockId: "source", toBlockId: "destination" } },
      } as WorkspaceBoardSnapshot,
      body: {},
      changed: true,
    });

    expect(summary).toBe("Đã sửa đường nối giữa \"Source\" và \"Destination\" (reroute only).");
  });
});
