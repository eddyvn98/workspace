import { useEffect } from "react";
import { currentMapLayout } from "../layout/mapRoot";
import { useWorkspaceStore, type WorkspaceStore } from "../store/useWorkspaceStore";
import type { CanvasBlock } from "../types/block";
import type { CanvasConnector } from "../types/connector";

type ConnectorLayoutState = Pick<WorkspaceStore,
  | "blocks"
  | "treeLayoutFamily"
  | "treeLayoutDirection"
  | "treeGrowthMode"
  | "treeConnectorLineType"
  | "treeConnectorPaletteId"
  | "treeTimelineBranchMode"
  | "treeTimelineDescendantStyle"
  | "treeCatalogDescendantStyle"
>;

export function isWorkspaceStructuralConnector(
  connector: CanvasConnector,
  blocks: Record<string, CanvasBlock>,
) {
  const from = blocks[connector.fromBlockId];
  const to = blocks[connector.toBlockId];
  return Boolean(from && to && to.parentId === from.id);
}

export function useWorkspaceConnectorSelectionPolicy(
  connectors: WorkspaceStore["connectors"],
  selectedConnectorId: WorkspaceStore["selectedConnectorId"],
  layoutState: ConnectorLayoutState,
) {
  const selectedConnector = selectedConnectorId ? connectors[selectedConnectorId] : null;
  const selectedConnectorFamily = selectedConnector
    ? currentMapLayout(layoutState, selectedConnector.fromBlockId).family
    : null;
  // Flowchart shapes are placed free-form and their wires are manually
  // authored decision branches (see "make the flowchart free-form" - drag no
  // longer auto-arranges the map), so a flowchart connector needs the same
  // manual bend/reroute editing hierarchy's free-floating connectors already
  // get. Its structural (parent -> child) connectors still route themselves
  // (resolveStructuralConnectorSides), so exclude those the same way.
  const isEditableFamily = (family: string) => family === "hierarchy" || family === "flowchart" || family === "swimlane";
  const isConnectorSelectable = (connector: CanvasConnector) => {
    const family = currentMapLayout(layoutState, connector.fromBlockId).family;
    // Flowchart quick-add intentionally creates a parentId relationship so
    // the new block remains in the map tree. That metadata must not make its
    // wire behave like a non-selectable hierarchy branch: flowchart wires are
    // manual decision paths, just like the sample template's wires.
    return isEditableFamily(family)
      && ((family === "flowchart" || family === "swimlane") || !isWorkspaceStructuralConnector(connector, layoutState.blocks));
  };
  const selectedConnectorIsSelectable = Boolean(
    selectedConnector
    && selectedConnectorFamily !== null && isEditableFamily(selectedConnectorFamily)
    && isConnectorSelectable(selectedConnector),
  );

  useEffect(() => {
    if (selectedConnectorId && selectedConnectorFamily !== null && !selectedConnectorIsSelectable) {
      useWorkspaceStore.getState().setSelectedConnectorId(null);
    }
  }, [selectedConnectorFamily, selectedConnectorId, selectedConnectorIsSelectable]);

  return { selectedConnectorIsSelectable, isConnectorSelectable };
}
