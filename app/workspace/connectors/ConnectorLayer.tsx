"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useAnchorRegistryVersion } from "./anchorRegistry";
import { ConnectorWaypointHandles } from "./ConnectorWaypointHandles";
import { ConnectorAuxiliaryPaths } from "./ConnectorAuxiliaryPaths";
import { useHiddenBlocks } from "../hooks/useHiddenBlocks";
import { useWorkspaceDragAutoPan } from "../hooks/useWorkspaceDragAutoPan";
import { useDetachingRootIds } from "../hooks/useDragConnectorPreview";
import { WorkspaceConnectorStroke } from "./WorkspaceConnectorStroke";
import { clientToWorkspaceWorld, screenUnits } from "./connectorPointer";
import { PendingConnectorPreview } from "./PendingConnectorPreview";
import { blockWorldRect } from "./blockWorldRect";
import { useWorkspaceConnectorSelectionPolicy } from "../hooks/useWorkspaceConnectorSelectionPolicy";
import { useWorkspaceConnectorRouting } from "./useWorkspaceConnectorRouting";

export function ConnectorLayer({ selectionOverlay = false, handleOverlay = false, visibleBlockIds }: { selectionOverlay?: boolean; handleOverlay?: boolean; visibleBlockIds?: ReadonlySet<string> }) {
  const anchorRegistryVersion = useAnchorRegistryVersion();
  const blocks = useWorkspaceStore((state) => state.blocks);
  const connectors = useWorkspaceStore((state) => state.connectors);
  const camera = useWorkspaceStore((state) => state.camera);
  const isDraggingBlock = useWorkspaceStore((state) => state.isDraggingBlock);
  const treeLayoutFamily = useWorkspaceStore((state) => state.treeLayoutFamily);
  const treeLayoutDirection = useWorkspaceStore((state) => state.treeLayoutDirection);
  const treeGrowthMode = useWorkspaceStore((state) => state.treeGrowthMode);
  const treeConnectorLineType = useWorkspaceStore((state) => state.treeConnectorLineType);
  const treeConnectorPaletteId = useWorkspaceStore((state) => state.treeConnectorPaletteId);
  const blockOrder = useWorkspaceStore((state) => state.blockOrder);
  const treeTimelineBranchMode = useWorkspaceStore((state) => state.treeTimelineBranchMode);
  const treeTimelineDescendantStyle = useWorkspaceStore((state) => state.treeTimelineDescendantStyle);
  const treeCatalogDescendantStyle = useWorkspaceStore((state) => state.treeCatalogDescendantStyle);
  const pendingConnectorFrom = useWorkspaceStore((state) => state.pendingConnectorFrom);
  const pendingConnectorFromSide = useWorkspaceStore((state) => state.pendingConnectorFromSide);
  const selectedConnectorId = useWorkspaceStore((state) => state.selectedConnectorId);
  const draggedBlockIds = useWorkspaceStore((state) => state.draggedBlockIds);
  const detachingRootIds = useDetachingRootIds();
  const svgRef = useRef<SVGSVGElement>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const pointerClientRef = useRef({ clientX: 0, clientY: 0 });
  const pendingAutoPan = useWorkspaceDragAutoPan(() => {
    const { clientX, clientY } = pointerClientRef.current;
    setPointerPos(clientToWorkspaceWorld({ x: clientX, y: clientY }));
  });

  useEffect(() => {
    if (!pendingConnectorFrom) {
      setPointerPos(null);
      pendingAutoPan.stop();
      return;
    }
    const handlePointerMove = (e: PointerEvent) => {
      pointerClientRef.current = { clientX: e.clientX, clientY: e.clientY };
      setPointerPos(clientToWorkspaceWorld({ x: e.clientX, y: e.clientY }));
      pendingAutoPan.reportPointer(e.clientX, e.clientY);
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      pendingAutoPan.stop();
    };
  }, [pendingAutoPan, pendingConnectorFrom]);

  const hitWidth = screenUnits(14, camera.zoom);
  const worldRect = (blockId: string) => blockWorldRect(blocks, blockId);
  const pendingSourceRect = pendingConnectorFrom ? worldRect(pendingConnectorFrom) : null;
  const hiddenBlocks = useHiddenBlocks();
  const layoutState = useMemo(() => ({
    blocks,
    treeLayoutFamily,
    treeLayoutDirection,
    treeGrowthMode,
    treeConnectorLineType,
    treeConnectorPaletteId,
    treeTimelineBranchMode,
    treeTimelineDescendantStyle,
    treeCatalogDescendantStyle,
  }), [blocks, treeLayoutFamily, treeLayoutDirection, treeGrowthMode, treeConnectorLineType, treeConnectorPaletteId, treeTimelineBranchMode, treeTimelineDescendantStyle, treeCatalogDescendantStyle]);
  const { selectedConnectorIsSelectable, isConnectorSelectable } = useWorkspaceConnectorSelectionPolicy(connectors, selectedConnectorId, layoutState);
  const { fishboneRibPaths, timelineAxisPaths, connectorGeometries, allPathInputs } = useWorkspaceConnectorRouting({
    blocks,
    connectors,
    layoutState,
    hiddenBlocks,
    blockOrder,
    isDraggingBlock,
    draggedBlockIds,
    anchorRegistryVersion,
    visibleBlockIds,
  });
  const selectionCycleRef = useRef<{ point: { x: number; y: number } | null; ids: string[]; index: number }>({ point: null, ids: [], index: 0 });
  const visibleConnectorGeometries = handleOverlay
    ? []
    : selectionOverlay
    ? connectorGeometries.filter((geometry) => geometry.connector.id === selectedConnectorId && isConnectorSelectable(geometry.connector))
    : connectorGeometries;

  return (
    <svg
      ref={svgRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
    >
      {!selectionOverlay && !handleOverlay && <ConnectorAuxiliaryPaths fishboneRibPaths={fishboneRibPaths} timelineAxisPaths={timelineAxisPaths} />}
      {visibleConnectorGeometries.map((geometry) => (
        <WorkspaceConnectorStroke
          key={geometry.connector.id}
          {...geometry}
          selected={selectionOverlay || (geometry.connector.id === selectedConnectorId && isConnectorSelectable(geometry.connector))}
          selectable={!selectionOverlay && isConnectorSelectable(geometry.connector)}
          detaching={detachingRootIds.has(geometry.connector.toBlockId)}
          hitWidth={hitWidth}
          allPathInputs={allPathInputs}
          candidatePaths={connectorGeometries}
          selectionCycleRef={selectionCycleRef}
        />
      ))}
      {pendingConnectorFrom && pendingSourceRect && pointerPos && <PendingConnectorPreview
        fromBlockId={pendingConnectorFrom} fromSide={pendingConnectorFromSide}
        sourceRect={pendingSourceRect} point={pointerPos}
        clientPoint={{ x: pointerClientRef.current.clientX, y: pointerClientRef.current.clientY }}
      />}
      {!selectionOverlay && !handleOverlay && selectedConnectorIsSelectable && <ConnectorWaypointHandles />}
      {handleOverlay && selectedConnectorIsSelectable && <ConnectorWaypointHandles interactive={false} />}
    </svg>
  );
}

export default ConnectorLayer;
