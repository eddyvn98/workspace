"use client";

import { useCallback, useMemo } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { createBlockId, type MapLayoutSettings } from "../types/block";
import { resolveTransform } from "../types/block";
import { currentMapLayout, DEFAULT_MAP_LAYOUT, selectedMapRootId } from "../layout/mapRoot";
import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";
import { applyWorkspaceMapLayoutPatch } from "../layout/applyMapLayoutPatch";
import { resolveWorkspaceTimelineBranchMode } from "../utils/layout/timelineBranchMode";
import { getWorkspaceViewportSize } from "../hooks/useWorkspaceViewportControls";
import { centeredWorkspaceCamera } from "../utils/workspaceViewport";
import { WorkspaceMapLayoutPicker } from "./layout";
import { createWorkspaceDiagramTemplate } from "../utils/templates";

function minimumLegacyAnchorY(family: MapLayoutSettings["family"]): number {
  if (family === "fishbone") return 300;
  if (family === "timeline") return 220;
  return 0;
}

interface CreateWorkspaceMapOptions {
  rootOnly?: boolean;
  /** Direction/line/palette the user already picked in the layout picker
   *  before confirming creation - overrides the kind's canonical defaults. */
  layoutOverrides?: Partial<MapLayoutSettings>;
}

export function createWorkspaceMap(kind: string, onMapCreated?: () => void, options: CreateWorkspaceMapOptions = {}): void {
  const state = useWorkspaceStore.getState();
  if (state.isReadOnly) return;
  const roots = Object.values(state.blocks).filter((block) => !block.parentId);
  const rightEdge = Object.values(state.blocks).reduce((max, block) => {
    const transform = block.transform.override ?? block.transform.computed;
    return Math.max(max, (transform?.x ?? 0) + (transform?.w ?? 180));
  }, 0);
  const top = roots.reduce((min, block) => Math.min(min, block.transform.override?.y ?? block.transform.computed?.y ?? 80), 80);
  const minimumOriginY = minimumLegacyAnchorY(kind as MapLayoutSettings["family"]);
  const originY = Math.max(top, minimumOriginY);
  const template = createWorkspaceDiagramTemplate(kind, {
    mapId: createBlockId(),
    origin: { x: roots.length ? rightEdge + 120 : 120, y: originY },
    layoutOverrides: options.layoutOverrides,
  });
  const blocks = options.rootOnly ? template.blocks.filter((block) => block.id === template.rootId) : template.blocks;
  const connectors = options.rootOnly ? [] : template.connectors;
  blocks.forEach((block) => state.addBlock(block));
  connectors.forEach((connector) => state.addConnector(connector));
  reflowWorkspaceTree(template.rootId, template.mapLayout, { clearOverrides: true, arrange: true });
  const nextState = useWorkspaceStore.getState();
  if (options.rootOnly) {
    const rootBlock = nextState.blocks[template.rootId];
    if (rootBlock) {
      const rootTransform = resolveTransform(rootBlock.transform, {
        x: 0,
        y: 0,
        w: 160,
        h: 80,
        rotation: 0,
        zIndex: 0,
      });
      state.setCamera(centeredWorkspaceCamera(rootTransform, getWorkspaceViewportSize()));
    }
  }
  state.setSelection([template.rootId]);
  onMapCreated?.();
}

export function createWorkspaceBlankMap(onMapCreated?: () => void): void {
  createWorkspaceMap("logical-right", onMapCreated, { rootOnly: true });
}

export function WorkspaceMapLayoutAdapter({ onMapCreated }: { onMapCreated?: () => void } = {}) {
  const blocks = useWorkspaceStore((state) => state.blocks);
  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const activeRootId = useMemo(
    () => selectedMapRootId({ blocks, selectedBlockIds }),
    [blocks, selectedBlockIds],
  );
  const treeLayoutFamily = useWorkspaceStore((state) => state.treeLayoutFamily);
  const treeLayoutDirection = useWorkspaceStore((state) => state.treeLayoutDirection);
  const treeGrowthMode = useWorkspaceStore((state) => state.treeGrowthMode);
  const treeConnectorLineType = useWorkspaceStore((state) => state.treeConnectorLineType);
  const treeConnectorPaletteId = useWorkspaceStore((state) => state.treeConnectorPaletteId);
  const treeTimelineBranchMode = useWorkspaceStore((state) => state.treeTimelineBranchMode);
  const treeTimelineDescendantStyle = useWorkspaceStore((state) => state.treeTimelineDescendantStyle);
  const treeCatalogDescendantStyle = useWorkspaceStore((state) => state.treeCatalogDescendantStyle);
  const fallback = useMemo(() => ({
    ...DEFAULT_MAP_LAYOUT,
    family: treeLayoutFamily,
    direction: treeLayoutDirection,
    growthMode: treeGrowthMode,
    connectorLineType: treeConnectorLineType,
    connectorPaletteId: treeConnectorPaletteId,
    timelineBranchMode: treeTimelineBranchMode,
    timelineDescendantStyle: treeTimelineDescendantStyle,
    catalogDescendantStyle: treeCatalogDescendantStyle,
  }), [treeLayoutFamily, treeLayoutDirection, treeGrowthMode, treeConnectorLineType, treeConnectorPaletteId, treeTimelineBranchMode, treeTimelineDescendantStyle, treeCatalogDescendantStyle]);
  const activeSettings = useMemo(() => {
    const state = useWorkspaceStore.getState();
    return activeRootId ? currentMapLayout(state, activeRootId) : fallback;
  }, [activeRootId, fallback]);
  const resolvedTimelineBranchMode = useMemo(() => {
    const mode = activeSettings.timelineBranchMode;
    if (mode !== "auto") return mode;
    const root = activeRootId ? blocks[activeRootId] : undefined;
    const milestones = root && !root.isCollapsed
      ? Object.values(blocks).filter((block) => block.parentId === activeRootId)
      : [];
    const activityCount = milestones.reduce((count, milestone) => {
      if (milestone.isCollapsed) return count;
      return count + Object.values(blocks).filter((block) => block.parentId === milestone.id).length;
    }, 0);
    return resolveWorkspaceTimelineBranchMode(mode, activityCount);
  }, [activeRootId, activeSettings.timelineBranchMode, blocks]);
  const mode = activeRootId ? "edit" : "create";

  const updateMapLayout = useCallback((patch: Partial<MapLayoutSettings>) => {
    if (!activeRootId) return;
    applyWorkspaceMapLayoutPatch(activeRootId, patch);
  }, [activeRootId]);

  const createNewMap = useCallback((kind: string, layoutOverrides?: Partial<MapLayoutSettings>) => {
    createWorkspaceMap(kind, onMapCreated, { layoutOverrides });
  }, [onMapCreated]);

  return (
    <WorkspaceMapLayoutPicker
      mode={mode}
      settings={activeSettings}
      resolvedTimelineBranchMode={resolvedTimelineBranchMode}
      onCreateNewMap={createNewMap}
      onChange={updateMapLayout}
    />
  );
}
