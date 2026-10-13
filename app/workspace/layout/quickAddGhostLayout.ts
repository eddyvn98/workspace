import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  createComputedTransform,
  resolveTransform,
  type BlockId,
  type CanvasBlock,
  type Transform,
} from "../types/block";
import { computeReflowPositions } from "./reflowWorkspaceTree";
import { currentMapLayout, DEFAULT_MAP_LAYOUT, findMapRootId } from "./mapRoot";
import { familyAutoArranges } from "./familyPositions";
import { calculateFloatingQuickAddPosition } from "./floatingQuickAddPlacement";
import type { QuickAddDirection } from "../hooks/useBlockQuickAdd";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
const SIBLING_SIZE = { w: 170, h: 36 };
export const QUICK_ADD_GHOST_ID = "__quick_add_ghost__";

export type QuickAddGhostMode = "child" | "siblingBefore" | "siblingAfter" | "parent";

export interface QuickAddGhostResult {
  rootId: BlockId;
  /** Real positions that the same reflow pass would change on commit. */
  positions: Map<BlockId, { x: number; y: number }>;
  ghost: { x: number; y: number; w: number; h: number } | null;
}

function fallbackLayout(state: ReturnType<typeof useWorkspaceStore.getState>) {
  return {
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
}

function makeGhost(anchor: CanvasBlock, size: { w: number; h: number }, parentId?: BlockId): CanvasBlock<"text"> {
  return {
    id: QUICK_ADD_GHOST_ID,
    type: "text",
    parentId,
    transform: createComputedTransform({
      ...DEFAULT_TRANSFORM,
      ...resolveTransform(anchor.transform, DEFAULT_TRANSFORM),
      ...size,
      x: 0,
      y: 0,
      zIndex: 0,
    }),
    data: { markdown: "New Node" },
    createdAt: 0,
    updatedAt: 0,
  };
}

/**
 * Runs the exact reflow used by the eventual click against a virtual block.
 * The old preview duplicated each family layout and therefore disagreed with
 * commit on blockOrder, hidden branches, fishbone slots, and sibling size.
 */
export function computeQuickAddGhostLayout(
  anchorId: BlockId,
  mode: QuickAddGhostMode,
  direction?: QuickAddDirection,
): QuickAddGhostResult | null {
  const state = useWorkspaceStore.getState();
  const anchor = state.blocks[anchorId];
  if (!anchor) return null;

  const parentId = anchor.parentId;
  if ((mode === "siblingBefore" || mode === "siblingAfter" || mode === "parent") && !parentId) return null;

  const anchorTransform = resolveTransform(anchor.transform, DEFAULT_TRANSFORM);

  // Free-form families (flowchart/swimlane) never auto-arrange — every
  // direction resolves to "child" for them (CHILD_ONLY_ROLES in
  // useBlockQuickAdd.ts) and the eventual commit places the new block with
  // this same literal-direction math (calculateFloatingQuickAddPosition),
  // never the tree-layout reflow below. Running that reflow here anyway
  // would (a) show a ghost stuck on whichever single axis the family's
  // layout is configured for, ignoring which of the four buttons is
  // actually hovered, and (b) shove every other real block on the map to
  // that hypothetical layout via the live-write below, with no matching
  // reflow on commit to move them back.
  const layout = currentMapLayout(state, anchorId);
  if (mode === "child" && direction && !familyAutoArranges(layout.family)) {
    const ghostSize = { w: anchorTransform.w, h: anchorTransform.h };
    const point = calculateFloatingQuickAddPosition(state.blocks, anchorId, anchorTransform, direction, ghostSize);
    return {
      rootId: findMapRootId(state.blocks, anchorId) ?? anchorId,
      positions: new Map(),
      ghost: { x: point.x, y: point.y, w: ghostSize.w, h: ghostSize.h },
    };
  }
  const ghostSize = mode === "siblingBefore" || mode === "siblingAfter"
    ? SIBLING_SIZE
    : { w: anchorTransform.w, h: anchorTransform.h };
  const ghostParentId = mode === "parent" ? parentId : mode === "child" ? anchorId : parentId;
  const hypotheticalBlocks: Record<BlockId, CanvasBlock> = {
    ...state.blocks,
    [QUICK_ADD_GHOST_ID]: makeGhost(anchor, ghostSize, ghostParentId),
  };
  const hypotheticalOrder = state.blockOrder.filter((id) => id !== QUICK_ADD_GHOST_ID);

  if (mode === "parent") {
    hypotheticalBlocks[anchorId] = { ...anchor, parentId: QUICK_ADD_GHOST_ID };
    const anchorIndex = hypotheticalOrder.indexOf(anchorId);
    hypotheticalOrder.splice(anchorIndex >= 0 ? anchorIndex : hypotheticalOrder.length, 0, QUICK_ADD_GHOST_ID);
  } else if (mode === "siblingBefore" || mode === "siblingAfter") {
    const anchorIndex = hypotheticalOrder.indexOf(anchorId);
    const insertAt = anchorIndex >= 0 ? anchorIndex + (mode === "siblingAfter" ? 1 : 0) : hypotheticalOrder.length;
    hypotheticalOrder.splice(insertAt, 0, QUICK_ADD_GHOST_ID);
  } else {
    hypotheticalOrder.push(QUICK_ADD_GHOST_ID);
  }

  const rootHint = mode === "parent" ? parentId! : anchorId;
  const computed = computeReflowPositions(
    rootHint,
    hypotheticalBlocks,
    hypotheticalOrder,
    fallbackLayout(state),
  );
  if (!computed) return null;

  const ghostPoint = computed.positions.get(QUICK_ADD_GHOST_ID);
  const ghost = ghostPoint
    ? { x: ghostPoint.x, y: ghostPoint.y, w: ghostSize.w, h: ghostSize.h }
    : null;
  const positions = new Map<BlockId, { x: number; y: number }>();
  computed.positions.forEach((point, id) => {
    // Keep the anchor under the hovered button and leave the root anchored;
    // all other entries are the exact real-block shifts on commit.
    if (id === computed.rootId || id === QUICK_ADD_GHOST_ID || id === anchorId) return;
    positions.set(id, point);
  });

  return { rootId: computed.rootId, positions, ghost };
}
