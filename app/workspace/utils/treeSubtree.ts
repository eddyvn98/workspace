import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { BlockId, CanvasBlock } from "../types/block";
import { createConnectorId } from "../types/connector";
import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";

export interface TreeHierarchy {
  roots: BlockId[];
  childrenByParent: Map<BlockId, BlockId[]>;
  totalTreeNodesCount: number;
}

/**
 * Collects target block id and all its descendant block ids reachable via parentId.
 */
export function collectSubtreeBlockIds(
  rootId: BlockId,
  blocks: Record<BlockId, CanvasBlock>
): Set<BlockId> {
  const result = new Set<BlockId>();
  const queue: BlockId[] = [rootId];

  // Map children by parent
  const childrenMap = new Map<BlockId, BlockId[]>();
  for (const block of Object.values(blocks)) {
    if (block.parentId) {
      const list = childrenMap.get(block.parentId) ?? [];
      list.push(block.id);
      childrenMap.set(block.parentId, list);
    }
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (result.has(currentId)) continue;
    result.add(currentId);

    const children = childrenMap.get(currentId) ?? [];
    for (const childId of children) {
      if (!result.has(childId)) {
        queue.push(childId);
      }
    }
  }

  return result;
}

/**
 * Removes target block and all of its descendants, plus any connectors attached to any of those blocks.
 */
export function deleteSubtree(targetId: BlockId): void {
  const store = useWorkspaceStore.getState();
  const subtreeIds = collectSubtreeBlockIds(targetId, store.blocks);

  // Remove connectors touching any deleted block
  for (const connector of Object.values(store.connectors)) {
    if (subtreeIds.has(connector.fromBlockId) || subtreeIds.has(connector.toBlockId)) {
      store.removeConnector(connector.id);
    }
  }

  // Remove blocks in the subtree
  for (const id of subtreeIds) {
    store.removeBlock(id);
  }
}

/**
 * Legacy Shift+Delete semantics: remove one tree node, attach its direct
 * children to the removed node's parent, and keep those children visible.
 */
export function deleteBlockPromoteChildren(targetId: BlockId): boolean {
  const store = useWorkspaceStore.getState();
  const target = store.blocks[targetId];
  const parentId = target?.parentId;
  if (!target || !parentId || !store.blocks[parentId]) return false;

  const children = Object.values(store.blocks).filter((block) => block.parentId === targetId);
  const directEdges = Object.values(store.connectors).filter(
    (connector) => connector.fromBlockId === targetId || connector.toBlockId === targetId,
  );
  const childEdgeById = new Map(children.map((child) => [
    child.id,
    directEdges.find((connector) => connector.toBlockId === child.id),
  ] as const));

  for (const connector of directEdges) store.removeConnector(connector.id);
  for (const child of children) store.updateBlock(child.id, { parentId });
  store.removeBlock(targetId);

  for (const child of children) {
    const source = childEdgeById.get(child.id);
    store.addConnector({
      id: createConnectorId(),
      fromBlockId: parentId,
      toBlockId: child.id,
      ...(source ? {
        strokeColor: source.strokeColor,
        strokeWidth: source.strokeWidth,
        dashed: source.dashed,
        arrowStart: source.arrowStart,
        arrowEnd: source.arrowEnd,
        lineType: source.lineType,
      } : {}),
    });
  }
  store.setSelection(children.map((child) => child.id));
  reflowWorkspaceTree(parentId);
  return true;
}

/**
 * Builds the tree hierarchy of all Tab/Enter trees on the canvas.
 * Roots are blocks with no valid parent on the board that have at least one child.
 */
export function buildTreeHierarchy(
  blocks: Record<BlockId, CanvasBlock>,
  blockOrder: BlockId[]
): TreeHierarchy {
  const childrenByParent = new Map<BlockId, BlockId[]>();

  // Iterate in blockOrder to preserve creation/paint order
  const orderedBlocks = blockOrder
    .map((id) => blocks[id])
    .filter((b): b is CanvasBlock => Boolean(b));

  for (const block of orderedBlocks) {
    if (block.parentId && blocks[block.parentId]) {
      const list = childrenByParent.get(block.parentId) ?? [];
      list.push(block.id);
      childrenByParent.set(block.parentId, list);
    }
  }

  const roots: BlockId[] = [];
  for (const block of orderedBlocks) {
    const hasNoParent = !block.parentId || !blocks[block.parentId];
    const hasChildren = (childrenByParent.get(block.id)?.length ?? 0) > 0;
    if (hasNoParent && hasChildren) {
      roots.push(block.id);
    }
  }

  const allTreeNodes = new Set<BlockId>();
  for (const rootId of roots) {
    const subtree = collectSubtreeBlockIds(rootId, blocks);
    for (const id of subtree) {
      allTreeNodes.add(id);
    }
  }

  return {
    roots,
    childrenByParent,
    totalTreeNodesCount: allTreeNodes.size,
  };
}
