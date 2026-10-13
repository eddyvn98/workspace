import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { resolveTransform, type BlockId, type MapLayoutSettings } from "../types/block";
import { currentMapLayout } from "./mapRoot";
import { reflowWorkspaceTree } from "./reflowWorkspaceTree";
import { applyWorkspaceMapStyleByDepth } from "../connectors/connectorStyle";
import { defaultConnectorLineTypeFor, defaultMapDirection, growthModeForFamilySwitch } from "../utils/layout/mapLayoutConfig";
import { captureWorkspaceViewportAnchor, clampWorkspaceViewportTop, restoreWorkspaceViewportAnchor } from "../utils/layout/workspaceViewportAnchor";

function minimumLegacyAnchorY(family: MapLayoutSettings["family"]): number {
  if (family === "fishbone") return 300;
  if (family === "timeline") return 220;
  return 0;
}

/**
 * Applies a layout-settings patch to ONE map, identified by its root block
 * id — every map on a board keeps its own independent settings (family,
 * direction, growth mode, connector line type...) stored on that root's own
 * `mapLayout` field, never a board-wide default. Extracted verbatim out of
 * WorkspaceMapLayoutAdapter.tsx's `updateMapLayout` callback so the chat/AI
 * action path (`applyWorkspaceMapStyleChatAction`) can apply the exact same
 * per-map update the toolbar's own layout picker does, instead of writing to
 * the board-wide `treeLayoutFamily` etc. fallback fields — which, being
 * global, silently changed EVERY map's effective layout, not just the one
 * targeted, the first time an unrelated map used them (found live: a
 * "change this map to fishbone" request bled into an unrelated map created
 * afterwards, since both fell back to the same global default).
 */
export function applyWorkspaceMapLayoutPatch(rootId: BlockId, patch: Partial<MapLayoutSettings>): void {
  const state = useWorkspaceStore.getState();
  if (state.isReadOnly) return;
  const previous = currentMapLayout(state, rootId);
  const targetFamily = patch.family ?? previous.family;
  const fixedLineType = defaultConnectorLineTypeFor(targetFamily);
  const viewportAnchor = captureWorkspaceViewportAnchor(state.blocks, state.selectedBlockIds, rootId, state.camera);
  const next = {
    ...previous,
    ...patch,
    // Only Hierarchy exposes connector selection. Every other family keeps
    // its renderer-owned line type even if an older caller sends a stale line.
    connectorLineType: targetFamily === "hierarchy"
      ? patch.connectorLineType ?? previous.connectorLineType
      : fixedLineType,
    growthMode: growthModeForFamilySwitch(previous.family, patch.family ?? previous.family, previous.growthMode, patch.growthMode),
    ...(patch.family && patch.family !== previous.family && !patch.direction
      ? { direction: defaultMapDirection(patch.family) ?? "right" }
      : {}),
    // Switching family alone must not leave connectors on their old line
    // type — Fishbone/Timeline/Treeview lock to one choice (lineOptions),
    // and a family switch has to apply it, not just keep whatever
    // Hierarchy had, or connectors keep rendering as curved bezier loops
    // over the new diagonal/right-angle node layout.
    ...(patch.family && patch.family !== previous.family && !patch.connectorLineType
      ? { connectorLineType: defaultConnectorLineTypeFor(patch.family) }
      : {}),
    ...(patch.connectorPaletteId ? { stylePresetId: patch.connectorPaletteId } : {}),
  };
  state.updateBlock(rootId, { mapLayout: next });
  // A family switch can introduce an upper branch that the old renderer
  // placed in a reserved vertical band. Preserve a manually dragged root,
  // but lift an auto-laid-out root before reflow so that Timeline/Fishbone
  // branches remain below the Workspace chrome and stay draggable.
  const root = state.blocks[rootId];
  if (patch.family && root && !root.transform.override) {
    const currentY = resolveTransform(root.transform, { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 }).y;
    const anchorY = Math.max(currentY, minimumLegacyAnchorY(next.family));
    if (anchorY !== currentY) state.updateBlockTransform(rootId, { y: anchorY }, "computed");
  }
  const clearsManualPositions = Boolean(
    patch.family || patch.direction || patch.growthMode ||
    patch.timelineDescendantStyle || patch.catalogDescendantStyle,
  );
  // Picking a layout (or creating a map from a template) is the user asking
  // for it to be laid out, so it arranges even for a free-form family —
  // which then leaves their placement alone from here on.
  reflowWorkspaceTree(rootId, next, { clearOverrides: clearsManualPositions, arrange: true });
  if (viewportAnchor) {
    const current = useWorkspaceStore.getState();
    const cameraPatch = restoreWorkspaceViewportAnchor(viewportAnchor, current.blocks, rootId, current.camera);
    if (cameraPatch) current.setCamera(cameraPatch);
  }
  // Restoring the selected node's screen anchor can move the camera back up
  // after a family reflow. Keep auto-laid-out upper branches below the
  // Workspace top bar; a manually dragged root is intentionally untouched.
  if (patch.family && root && !root.transform.override) {
    const current = useWorkspaceStore.getState();
    const topPatch = clampWorkspaceViewportTop(current.blocks, rootId, current.camera);
    if (topPatch) current.setCamera(topPatch);
  }
  if (patch.connectorLineType || patch.connectorPaletteId || next.connectorLineType !== previous.connectorLineType) {
    // Reflow may materialize family-owned structural connectors (notably the
    // Fishbone backbone). Read the store after reflow so styling does not
    // replace that fresh connector set with the pre-reflow snapshot.
    const current = useWorkspaceStore.getState();
    const styled = applyWorkspaceMapStyleByDepth(
      current.connectors,
      current.blocks,
      rootId,
      next.connectorLineType,
      next.connectorPaletteId,
    );
    useWorkspaceStore.setState((state2) => state2.isReadOnly ? state2 : { connectors: styled });
  }
}
