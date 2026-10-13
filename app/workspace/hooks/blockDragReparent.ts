import { createConnectorId } from "../types/connector";
import { applyWorkspaceMapStyleByDepth } from "../connectors/connectorStyle";
import { currentMapLayout, findMapRootId } from "../layout/mapRoot";
import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";
import { canReparentBlock, getReparentRoots, type ReparentPlacement } from "../layout/reparentPreview";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { isStandaloneContentBlockType, resolveTransform, type BlockId, type CanvasBlock } from "../types/block";
import type { ConnectorId } from "../types/connector";
import { DEFAULT_DRAG_TRANSFORM } from "./blockDragTypes";

/** Detach every dragged root that still has a real parent, dropping its
 *  structural connector — the "dragged past the detach buffer, released
 *  over empty space" outcome. Extracted out of useBlockDrag.ts's
 *  onPointerUp purely to keep that file under the project's 300-line cap. */
export function detachDraggedRoots(
  draggedIds: BlockId[],
  removeConnector: (id: ConnectorId) => void,
  updateBlock: (id: BlockId, patch: Partial<Omit<CanvasBlock, "id" | "transform">>) => void,
): void {
  const blocksNow = useWorkspaceStore.getState().blocks;
  for (const root of getReparentRoots(blocksNow, draggedIds)) {
    const block = blocksNow[root];
    if (!block?.parentId || block.isFloating) continue;
    const oldParentId = block.parentId;
    const currentState = useWorkspaceStore.getState();
    const sourceMapRootId = findMapRootId(currentState.blocks, root);
    const inheritedMapLayout = sourceMapRootId
      ? currentMapLayout(currentState, sourceMapRootId)
      : undefined;
    // .filter, not .find: an earlier stale reparent could have already left
    // more than one fromParent->root connector behind (see
    // commitWorkspaceReparent's own dedup below) - removing only the first
    // match here would silently perpetuate a duplicate forever instead of
    // ever cleaning it up.
    Object.values(currentState.connectors)
      .filter((candidate) => candidate.fromBlockId === oldParentId && candidate.toBlockId === root)
      .forEach((candidate) => removeConnector(candidate.id));
    updateBlock(root, {
      parentId: undefined,
      isFloating: true,
      ...(isStandaloneContentBlockType(block.type)
        ? { mapLayout: undefined }
        : inheritedMapLayout ? { mapLayout: inheritedMapLayout } : {}),
    });
    reflowWorkspaceTree(oldParentId);
  }
}

export function commitWorkspaceReparent(targetId: BlockId | null, draggedIds: BlockId[], placement: ReparentPlacement = "child"): boolean {
  if (!targetId) return false;
  const state = useWorkspaceStore.getState();
  if (!canReparentBlock(state.blocks, draggedIds, targetId)) return false;

  // A dragged root (a whole map's own root block, parentId undefined) is a
  // valid reparent source too — matches legacy, which lets you drag one map
  // onto another to merge them (see canReparentBlock's comment).
  const roots = getReparentRoots(state.blocks, draggedIds);
  if (roots.length === 0) return false;
  const movedIds = new Set<BlockId>();
  const collectSubtree = (id: BlockId) => {
    if (movedIds.has(id)) return;
    movedIds.add(id);
    Object.values(state.blocks).forEach((block) => {
      if (block.parentId === id) collectSubtree(block.id);
    });
  };
  roots.forEach(collectSubtree);
  const resolvedMovedTransforms = new Map([...movedIds].map((id) => {
    const block = state.blocks[id];
    return [id, block ? resolveTransform(block.transform, DEFAULT_DRAG_TRANSFORM) : null] as const;
  }));
  const targetParentId = placement === "child" ? targetId : state.blocks[targetId]?.parentId;
  if (!targetParentId) return false;
  // Legacy reparenting copies the target node's connection appearance onto
  // the moved node. In the flat model that appearance is represented by the
  // target's incoming structural edge; fall back to the source edge when the
  // target is a map root and has no incoming edge.
  const targetConnector = state.blocks[targetId]?.parentId
    ? Object.values(state.connectors).find((candidate) =>
      candidate.fromBlockId === state.blocks[targetId]?.parentId && candidate.toBlockId === targetId,
    )
    : undefined;
  const inheritedStyle = targetConnector ?? roots.map((id) => state.blocks[id]?.parentId
    ? Object.values(state.connectors).find((candidate) =>
      candidate.fromBlockId === state.blocks[id]?.parentId && candidate.toBlockId === id,
    )
    : undefined).find(Boolean);
  const createdConnectorIds = new Set<ConnectorId>();
  const inheritedVisualStyle = inheritedStyle ? {
    strokeColor: inheritedStyle.strokeColor,
    strokeWidth: inheritedStyle.strokeWidth,
    dashed: inheritedStyle.dashed,
    arrowStart: inheritedStyle.arrowStart,
    arrowEnd: inheritedStyle.arrowEnd,
  } : undefined;
  const parentsToReflow = new Set<BlockId>([targetParentId]);
  if (placement === "child") state.updateBlock(targetId, { isCollapsed: false });
  // Move the entire dragged forest as one paint-order unit. Keeping a
  // descendant at its old blockOrder position leaves a reparented map split
  // across unrelated nodes, which makes a dragged subtree appear to stack in
  // the wrong place even though its parent links are correct.
  const orderIndex = new Map(state.blockOrder.map((id, index) => [id, index]));
  const depthWithinMovedTree = (id: BlockId): number => {
    let depth = 0;
    let parentId = state.blocks[id]?.parentId;
    const seen = new Set<BlockId>();
    while (parentId && movedIds.has(parentId) && !seen.has(parentId)) {
      depth += 1;
      seen.add(parentId);
      parentId = state.blocks[parentId]?.parentId;
    }
    return depth;
  };
  const orderedMovedIds = [...movedIds].sort((a, b) => {
    const depthDelta = depthWithinMovedTree(a) - depthWithinMovedTree(b);
    if (depthDelta !== 0) return depthDelta;
    return (orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER);
  });
  const nextOrder = state.blockOrder.filter((id) => !movedIds.has(id));
  const anchorIndex = nextOrder.indexOf(targetId);
  if (anchorIndex >= 0) {
    // A "child" drop has to land the moved root(s) AFTER every existing
    // child of targetId in blockOrder, not wherever they happened to sit
    // before the drag — childrenByParent (reflowWorkspaceTree's positions,
    // and the tree layout it feeds) is built by walking blockOrder in
    // order, so a stale earlier position here made a reattached branch with
    // its own descendants slot in ahead of the target's real children
    // instead of appended after them, landing it centered above its own new
    // parent instead of below its siblings.
    const insertIndex = placement === "child"
      ? nextOrder.reduce((lastChildIndex, id, index) =>
        state.blocks[id]?.parentId === targetId ? index + 1 : lastChildIndex,
        anchorIndex + 1)
      : anchorIndex + (placement === "after" ? 1 : 0);
    nextOrder.splice(insertIndex, 0, ...orderedMovedIds);
    state.setBlockOrder(nextOrder);
  }
  for (const id of roots) {
    const oldParentId = state.blocks[id]?.parentId;
    if (oldParentId) parentsToReflow.add(oldParentId);
    // Drop the wire from wherever this block used to hang, AND any wire
    // that already runs from the new parent to it — a block can reach this
    // point already carrying a stale targetParentId->id connector (e.g. a
    // prior detach that didn't fully clean up, see detachDraggedRoots'
    // own comment), and addConnector below would otherwise draw a second,
    // overlapping wire next to it instead of replacing it.
    Object.values(useWorkspaceStore.getState().connectors)
      .filter((candidate) =>
        (oldParentId && candidate.fromBlockId === oldParentId && candidate.toBlockId === id)
        || (candidate.fromBlockId === targetParentId && candidate.toBlockId === id))
      .forEach((candidate) => state.removeConnector(candidate.id));
    state.updateBlock(id, { parentId: targetParentId, isFloating: false });
    const layout = currentMapLayout(useWorkspaceStore.getState(), targetParentId);
    const connectorId = createConnectorId();
    createdConnectorIds.add(connectorId);
    useWorkspaceStore.getState().addConnector({
      id: connectorId,
      fromBlockId: targetParentId,
      toBlockId: id,
      strokeColor: inheritedStyle?.strokeColor,
      strokeWidth: inheritedStyle?.strokeWidth,
      dashed: inheritedStyle?.dashed,
      arrowStart: inheritedStyle?.arrowStart,
      ...(inheritedStyle?.arrowEnd !== undefined ? { arrowEnd: inheritedStyle.arrowEnd } : {}),
      lineType: layout.connectorLineType,
    });
  }
  // A reattached subtree belongs to the target map's layout again. Drop every
  // manual override captured while it was attached to the old parent so the
  // new parent can place the whole subtree together, matching legacy drag-drop.
  useWorkspaceStore.setState((current) => current.isReadOnly ? current : {
    blocks: Object.fromEntries(Object.values(current.blocks).map((block) =>
      movedIds.has(block.id)
        ? [block.id, {
          ...block,
          transform: {
            ...block.transform,
            // A copied/resized node may keep its real dimensions only in
            // override. Preserve them before the drag override is cleared;
            // otherwise resolveTransform falls back to 160x80 on reparent.
            computed: {
              ...(block.transform.computed ?? resolvedMovedTransforms.get(block.id) ?? DEFAULT_DRAG_TRANSFORM),
              ...(resolvedMovedTransforms.get(block.id)
                ? {
                  w: resolvedMovedTransforms.get(block.id)!.w,
                  h: resolvedMovedTransforms.get(block.id)!.h,
                  rotation: resolvedMovedTransforms.get(block.id)!.rotation,
                  zIndex: resolvedMovedTransforms.get(block.id)!.zIndex,
                }
                : {}),
            },
            override: null,
          },
        }]
        : [block.id, block]
    )),
  });
  parentsToReflow.forEach((rootHint) => reflowWorkspaceTree(rootHint));
  const targetState = useWorkspaceStore.getState();
  const targetMapRootId = findMapRootId(targetState.blocks, targetParentId);
  if (targetMapRootId) {
    const targetLayout = currentMapLayout(targetState, targetMapRootId);
    const styledConnectors = applyWorkspaceMapStyleByDepth(
      targetState.connectors,
      targetState.blocks,
      targetMapRootId,
      targetLayout.connectorLineType,
      targetLayout.connectorPaletteId,
    );
    useWorkspaceStore.setState((current) => current.isReadOnly ? current : {
      connectors: inheritedVisualStyle
        ? Object.fromEntries(Object.values(styledConnectors).map((connector) => createdConnectorIds.has(connector.id)
          ? [connector.id, { ...connector, ...inheritedVisualStyle }]
          : [connector.id, connector]))
        : styledConnectors,
    });
  }
  return true;
}
