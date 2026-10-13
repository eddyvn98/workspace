import { resolveTransform, type BlockId, type CanvasBlock, type MapLayoutSettings } from "../types/block";
import { DEFAULT_MAP_LAYOUT } from "./mapRoot";
import { computeReflowPositions } from "./reflowWorkspaceTree";
import type { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { ReparentPlacement } from "./reparentPreview";

const DEFAULT_TRANSFORM = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 } as const;

/** The dragged block's "would-be landing spot" if the drag committed right
 *  now — a hypothetical reparent under `targetId`, laid out with the same
 *  pure math `reflowWorkspaceTree` runs after a real drop, but never
 *  committed to the store. Only covers the "child" (merge) placement; a
 *  "before"/"after" sibling reorder keeps using the existing orange target
 *  outline instead, since a full reorder preview would need to simulate
 *  block-order too. */
export function computeMergePreviewBox(
  targetId: BlockId,
  placement: ReparentPlacement,
  draggedId: BlockId,
  state: ReturnType<typeof useWorkspaceStore.getState>,
): { x: number; y: number; w: number; h: number } | null {
  if (placement !== "child") return null;
  if (targetId === draggedId || !state.blocks[targetId] || !state.blocks[draggedId]) return null;

  const hypotheticalBlocks: Record<BlockId, CanvasBlock> = {
    ...state.blocks,
    [draggedId]: { ...state.blocks[draggedId], parentId: targetId },
  };

  const fallback: MapLayoutSettings = {
    ...DEFAULT_MAP_LAYOUT,
    family: state.treeLayoutFamily,
    direction: state.treeLayoutDirection,
    growthMode: state.treeGrowthMode,
    connectorLineType: state.treeConnectorLineType,
    connectorPaletteId: state.treeConnectorPaletteId,
    timelineBranchMode: state.treeTimelineBranchMode,
    timelineDescendantStyle: state.treeTimelineDescendantStyle,
    catalogDescendantStyle: state.treeCatalogDescendantStyle,
  };

  const computed = computeReflowPositions(targetId, hypotheticalBlocks, state.blockOrder, fallback);
  const point = computed?.positions.get(draggedId);
  if (!point) return null;

  const size = resolveTransform(state.blocks[draggedId].transform, DEFAULT_TRANSFORM);
  return { x: point.x, y: point.y, w: size.w, h: size.h };
}
