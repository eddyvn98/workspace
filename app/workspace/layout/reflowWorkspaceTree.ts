import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { resolveTransform, type BlockId, type CanvasBlock, type MapLayoutSettings, type Transform } from "../types/block";
import { CATEGORY_X_OFFSET, PAIR_SPACING } from "./fishboneLayout";
import { captureFishboneSlots } from "./fishboneFootprint";
import { orientTimelineLayout } from "./timelineOrientation";
import { ALONG_GAP, DESCRIPTION_PANEL_EXTRA_HEIGHT, type TreeLayoutSize } from "./treeLayout";
import { computeFamilyPositions, computeSwimlaneHeaderCells, familyAutoArranges, familyRecentersRoot } from "./familyPositions";
import { applyComputedLayoutPositions } from "./applyComputedLayoutPositions";
import { applyDecisionBranchLabels } from "./applyDecisionBranchLabels";
import { blockIdsInMap, DEFAULT_MAP_LAYOUT, resolveMapLayout } from "./mapRoot";
import { computeStructuralConnectorPatch } from "./reflowConnectorSides";
import { anchorRegistry } from "../connectors/anchorRegistry";
import { avoidWorkspaceNodeOverlaps } from "./workspaceCollisionPacking";
import { syncFishboneBackbone } from "./reflowFamilyConnectors";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
export interface ReflowPositionsResult {
  rootId: BlockId;
  layout: MapLayoutSettings;
  /** Absolute canvas positions, already translated by the hierarchy family's
   *  center-to-anchor offset (see reflowRoot's own comment on that below) —
   *  ready to compare against a block's live transform with no further math. */
  positions: Map<BlockId, { x: number; y: number }>;
  laneCells: Map<BlockId, { w: number; h: number }>;
  childrenByParent: Map<BlockId, BlockId[]>;
}

/** Pure position math shared by reflowRoot (which then commits the result to
 *  the store) and a drag's live "would-be landing spot" preview (which never
 *  commits it at all). Reads `blocks`/`blockOrder` as given rather than from
 *  the live store so a preview can pass a hypothetical, not-yet-committed
 *  parentId change without mutating anything. */
export function computeReflowPositions(
  rootHint: BlockId,
  blocks: Record<BlockId, CanvasBlock>,
  blockOrder: BlockId[],
  fallbackLayout: MapLayoutSettings,
  settings?: MapLayoutSettings,
): ReflowPositionsResult | null {
  if (!blocks[rootHint]) return null;

  let rootId = rootHint;
  for (let guard = 0; guard < 1000; guard += 1) {
    const parentId = blocks[rootId]?.parentId;
    if (!parentId || !blocks[parentId]) break;
    rootId = parentId;
  }

  const childrenByParent = new Map<BlockId, BlockId[]>();
  const sizes = new Map<BlockId, TreeLayoutSize>();
  const currentPositions = new Map<BlockId, { x: number; y: number }>();
  const orderedBlocks = [
    ...blockOrder.map((id) => blocks[id]).filter(Boolean),
    ...Object.values(blocks).filter((block) => !blockOrder.includes(block.id)),
  ];
  const isVisibleToLayout = (blockId: BlockId): boolean => {
    let currentId: BlockId | undefined = blockId;
    for (let guard = 0; currentId && guard < 1000; guard += 1) {
      const current: CanvasBlock | undefined = blocks[currentId];
      if (!current) return false;
      const parentId: BlockId | undefined = current.parentId;
      if (!parentId) return true;
      if (blocks[parentId]?.isCollapsed) return false;
      currentId = parentId;
    }
    return false;
  };
  for (const block of orderedBlocks) {
    const resolved = resolveTransform(block.transform, DEFAULT_TRANSFORM);
    currentPositions.set(block.id, { x: resolved.x, y: resolved.y });
    // See DESCRIPTION_PANEL_EXTRA_HEIGHT's own doc comment — reserves cross-
    // axis room for the description panel a described block renders below
    // itself, so reflow doesn't seat the next sibling/row on top of it.
    // Never inflate the tree's own root: every layout family's own function
    // (fishboneLayout/orgChartLayout/timelineLayout/treeviewLayout) reads
    // sizes.get(rootId) for the root's real absolute box geometry (spine/
    // origin centering), not for cross-axis sibling spacing — inflating it
    // would shift that math for a described root, not just add clearance.
    const extra = block.id !== rootId && block.description ? DESCRIPTION_PANEL_EXTRA_HEIGHT : 0;
    sizes.set(block.id, { w: resolved.w, h: resolved.h + extra });
    if (block.parentId && isVisibleToLayout(block.id)) {
      const children = childrenByParent.get(block.parentId) ?? [];
      children.push(block.id);
      childrenByParent.set(block.parentId, children);
    }
  }

  const root = blocks[rootId];
  const origin = resolveTransform(root.transform, DEFAULT_TRANSFORM);
  const layout = settings ?? resolveMapLayout(root, fallbackLayout);
  const { family, direction } = layout;
  const fishboneCapturedSlots = layout.family === "fishbone" && !root.isFloating
    ? captureFishboneSlots(
      rootId,
      childrenByParent.get(rootId) ?? [],
      currentPositions,
      { rootWidth: origin.w, xGap: ALONG_GAP, pairSpacing: PAIR_SPACING, categoryXOffset: CATEGORY_X_OFFSET },
    )
    : undefined;
  const positions = computeFamilyPositions(layout, rootId, origin, childrenByParent, sizes, { fishboneCapturedSlots });

  if (family === "timeline") {
    orientTimelineLayout(positions, rootId, sizes, direction);
  }

  // See familyRecentersRoot for why only some families need this.
  const computedRoot = familyRecentersRoot(family) ? positions.get(rootId) : undefined;
  const anchorOffset = computedRoot
    ? { x: origin.x - computedRoot.x, y: origin.y - computedRoot.y }
    : { x: 0, y: 0 };
  const translated = new Map<BlockId, { x: number; y: number }>();
  positions.forEach((point, id) => {
    translated.set(id, id === rootId ? point : { x: point.x + anchorOffset.x, y: point.y + anchorOffset.y });
  });
  avoidWorkspaceNodeOverlaps(blocks, translated, rootId, layout);

  return {
    rootId,
    layout,
    positions: translated,
    laneCells: computeSwimlaneHeaderCells(layout, rootId, childrenByParent, sizes),
    childrenByParent,
  };
}

function reflowRoot(
  rootHint: BlockId,
  clearOverrides = false,
  settings?: MapLayoutSettings,
  arrange = false,
  preserveBlockId?: BlockId,
): void {
  const state = useWorkspaceStore.getState();
  if (state.isReadOnly) return;
  const blocks = state.blocks;
  if (!blocks[rootHint]) return;

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
  const computed = computeReflowPositions(rootHint, blocks, state.blockOrder, fallback, settings);
  if (!computed) return;
  const { rootId, layout, positions, laneCells, childrenByParent } = computed;
  const { family } = layout;
  const root = blocks[rootId];
  const origin = resolveTransform(root.transform, DEFAULT_TRANSFORM);

  if (preserveBlockId) {
    const anchor = blocks[preserveBlockId];
    const calculated = positions.get(preserveBlockId);
    if (anchor && calculated) {
      const actual = resolveTransform(anchor.transform, DEFAULT_TRANSFORM);
      const dx = actual.x - calculated.x;
      const dy = actual.y - calculated.y;
      blockIdsInMap(blocks, preserveBlockId).forEach((id) => {
        if (id === preserveBlockId) return;
        const point = positions.get(id);
        if (point) positions.set(id, { x: point.x + dx, y: point.y + dy });
      });
    }
  }

  if (clearOverrides) {
    const mapIds = blockIdsInMap(blocks, rootId);
    useWorkspaceStore.setState((current) => current.isReadOnly ? current : {
      blocks: Object.fromEntries(Object.values(current.blocks).map((block) => {
        if (block.id === rootId || !mapIds.has(block.id) || !positions.has(block.id)) return [block.id, block];
        return [block.id, { ...block, transform: { ...block.transform, override: null } }];
      })),
    });
  }

  if (arrange || familyAutoArranges(family)) {
    applyComputedLayoutPositions(rootId, positions, laneCells);
  }

  // The connector layer measures each block's rect, so it has to recompute
  // AFTER the browser has applied the transforms written just above. Each
  // block does refresh itself when its transform changes, but from an effect
  // that runs after paint — so a layout pass can leave a wire computed from
  // the rect a block had BEFORE the pass moved it, with nothing left to
  // invalidate it, and the wire stays visibly offset until a remount.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      positions.forEach((_point, id) => anchorRegistry.refresh(id));
    });
  }

  applyDecisionBranchLabels(family, rootId, blocks, childrenByParent);
  syncFishboneBackbone(family, rootId, layout, childrenByParent.get(rootId) ?? [], positions, origin);

  // A quick-add connector freezes fromSide/toSide to whatever direction button
  // created it (e.g. "bottom" for an Add-below gesture). A later layout-family
  // or direction change repositions every block into the new arrangement but
  // never revisits that frozen side, so a connector that used to drop straight
  // down can end up rendered between a node's bottom edge and its new
  // horizontal neighbor's top edge — a stray loop instead of a straight line.
  // Structural parent→child edges (no manual waypoints) should always resolve
  // their side from the post-reflow geometry.
  const mapIds = blockIdsInMap(blocks, rootId);
  const structuralConnectors = Object.values(state.connectors).filter((connector) =>
    mapIds.has(connector.fromBlockId) &&
    mapIds.has(connector.toBlockId) &&
    blocks[connector.toBlockId]?.parentId === connector.fromBlockId &&
    !connector.waypoints?.length
  );
  // Each family pins its own structural connector sides instead of leaving
  // them to generic nearest-side geometry — see reflowConnectorSides.ts for
  // why each one needs it (stacked/hierarchy treeview rails, fishbone's
  // ladder columns, timeline's axis-aligned hops, hierarchy's growth axis).
  if (structuralConnectors.length > 0) {
    const patchById = new Map(structuralConnectors.map((connector) =>
      [connector.id, computeStructuralConnectorPatch(connector, layout, blocks, positions)] as const
    ));
    useWorkspaceStore.setState((current) => ({
      connectors: Object.fromEntries(Object.values(current.connectors).map((connector) => {
        const patch = patchById.get(connector.id);
        return patch ? [connector.id, { ...connector, ...patch }] : [connector.id, connector];
      })),
    }));
  }
}

/** Recompute every tree root after a map-layout option changes. */
export function reflowWorkspaceTrees(options: { clearOverrides?: boolean } = {}): void {
  const state = useWorkspaceStore.getState();
  const { blocks } = state;
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
  const childParents = new Set(Object.values(blocks).map((block) => block.parentId).filter(Boolean));
  Object.values(blocks)
    .filter((block) => !block.parentId && childParents.has(block.id))
    .forEach((root) => reflowRoot(root.id, options.clearOverrides, resolveMapLayout(root, fallback)));
}

export function reflowWorkspaceTree(
  rootHint: BlockId,
  settings?: MapLayoutSettings,
  options: { clearOverrides?: boolean; arrange?: boolean; preserveBlockPosition?: BlockId } = {},
): void {
  reflowRoot(rootHint, options.clearOverrides, settings, options.arrange, options.preserveBlockPosition);
}

/** The user asking, in so many words, to tidy this map up — the only thing
 *  that repositions a free-form family (see familyAutoArranges). */
export function arrangeWorkspaceMap(rootHint: BlockId, settings?: MapLayoutSettings): void {
  reflowRoot(rootHint, false, settings, true);
}
