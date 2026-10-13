import type { BlockId, CanvasBlock } from "../types/block";
import { applyWorkspaceMapStyleByDepth, getWorkspaceConnectorPalette } from "./connectorStyle";
import { currentMapLayout, findMapRootId } from "../layout/mapRoot";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

function mapDepth(blocks: Record<BlockId, CanvasBlock>, blockId: BlockId, rootId: BlockId): number {
  let depth = 0;
  let current = blocks[blockId];
  while (current && current.id !== rootId && current.parentId && depth < 1000) {
    depth += 1;
    current = blocks[current.parentId];
  }
  return depth;
}

function belongsToMap(blocks: Record<BlockId, CanvasBlock>, blockId: BlockId, rootId: BlockId): boolean {
  let current = blocks[blockId];
  for (let guard = 0; current && guard < 1000; guard += 1) {
    if (current.id === rootId) return true;
    if (!current.parentId) return false;
    current = blocks[current.parentId];
  }
  return false;
}

/** Recomputes connector colors after a quick-add mutation changes the tree. */
export function restyleWorkspaceMapConnectors(blockId: BlockId, detachedBlockIds: ReadonlySet<BlockId> = new Set()): void {
  const current = useWorkspaceStore.getState();
  if (current.isReadOnly) return;

  const rootId = findMapRootId(current.blocks, blockId);
  if (!rootId) return;

  const layout = currentMapLayout(current, rootId);
  const styled = applyWorkspaceMapStyleByDepth(
    current.connectors,
    current.blocks,
    rootId,
    layout.connectorLineType,
    layout.connectorPaletteId,
  );
  const colors = getWorkspaceConnectorPalette(layout.connectorPaletteId).colors;
  const sourceDepth = mapDepth(current.blocks, blockId, rootId);
  const sourceColor = colors[(Math.max(sourceDepth, 1) - 1) % colors.length];
  const connectors = Object.fromEntries(Object.values(styled).map((connector) => {
    const connectorInMap = belongsToMap(current.blocks, connector.fromBlockId, rootId)
      && belongsToMap(current.blocks, connector.toBlockId, rootId);
    if (connectorInMap) {
      const depth = mapDepth(current.blocks, connector.toBlockId, rootId);
      return [connector.id, { ...connector, strokeColor: colors[(Math.max(depth, 1) - 1) % colors.length] }];
    }
    const touchesDetachedBlock = detachedBlockIds.has(connector.fromBlockId) || detachedBlockIds.has(connector.toBlockId);
    const isQuickAddEdge = touchesDetachedBlock && (connector.fromBlockId === blockId || connector.toBlockId === blockId);
    return [connector.id, isQuickAddEdge ? { ...connector, lineType: layout.connectorLineType, strokeColor: sourceColor } : connector];
  }));
  useWorkspaceStore.setState((state) => state.isReadOnly ? state : { connectors });
}
