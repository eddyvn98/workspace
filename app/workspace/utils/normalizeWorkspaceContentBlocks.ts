import { isStandaloneContentBlockType, type BlockId, type CanvasBlock } from "../types/block";
import type { CanvasConnector } from "../types/connector";

export interface WorkspaceContentNormalization {
  blocks: Record<BlockId, CanvasBlock>;
  connectors: Record<string, CanvasConnector>;
  changed: boolean;
}

/** Removes legacy accidental tree membership from document-like blocks. */
export function normalizeWorkspaceContentBlocks(
  blocks: Record<BlockId, CanvasBlock>,
  connectors: Record<string, CanvasConnector>,
): WorkspaceContentNormalization {
  const standaloneIds = new Set(
    Object.values(blocks)
      .filter((block) => isStandaloneContentBlockType(block.type))
      .map((block) => block.id),
  );
  let changed = false;
  const normalizedBlocks = Object.fromEntries(Object.values(blocks).map((block) => {
    const isStandalone = standaloneIds.has(block.id);
    const isChildOfStandalone = Boolean(block.parentId && standaloneIds.has(block.parentId));
    if (!isStandalone && !isChildOfStandalone) return [block.id, block];

    const next = { ...block };
    if (next.parentId !== undefined) {
      delete next.parentId;
      changed = true;
    }
    if (next.isFloating !== true) {
      next.isFloating = true;
      changed = true;
    }
    if (isStandalone && next.mapLayout !== undefined) {
      delete next.mapLayout;
      changed = true;
    }
    return [block.id, next];
  })) as Record<BlockId, CanvasBlock>;

  const normalizedConnectors = Object.fromEntries(Object.entries(connectors).filter(([, connector]) => {
    const from = blocks[connector.fromBlockId];
    const to = blocks[connector.toBlockId];
    const isStructuralContentConnector = Boolean(
      to?.parentId === from?.id && (standaloneIds.has(from?.id) || standaloneIds.has(to?.id)),
    );
    if (isStructuralContentConnector) changed = true;
    return !isStructuralContentConnector;
  }));

  return {
    blocks: changed ? normalizedBlocks : blocks,
    connectors: changed ? normalizedConnectors : connectors,
    changed,
  };
}
