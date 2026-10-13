"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  type BlockId,
  type CanvasBlock,
  type Transform,
  createBlockId,
  createComputedTransform,
  createDualTransform,
  resolveTransform,
} from "../types/block";
import { createConnectorId, type CanvasConnector } from "../types/connector";
import { withoutTableAttachments } from "../utils/tableAttachments";
import { collectReferencedBlockIds, remapContainerReferences } from "../utils/blockReferences";
import { writeWorkspaceImageToClipboard } from "../utils/workspaceImageClipboardWrite";
import { currentMapLayout, findMapRootId } from "../layout/mapRoot";
import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";
import { restyleWorkspaceMapConnectors } from "../connectors/restyleWorkspaceMapConnectors";

const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  w: 160,
  h: 80,
  rotation: 0,
  zIndex: 0,
};

function cloneValue<T>(data: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(data);
    } catch {
      // Fallback if structuredClone fails
    }
  }
  return JSON.parse(JSON.stringify(data));
}

interface WorkspaceClipboardPayload {
  blocks: CanvasBlock[];
  connectors: CanvasConnector[];
}

let clipboardPayload: WorkspaceClipboardPayload = { blocks: [], connectors: [] };
const clipboardListeners = new Set<() => void>();

function subscribeClipboard(listener: () => void) {
  clipboardListeners.add(listener);
  return () => clipboardListeners.delete(listener);
}

function setClipboard(payload: WorkspaceClipboardPayload) {
  clipboardPayload = payload;
  clipboardListeners.forEach((listener) => listener());
}

export interface UseClipboardResult {
  copy: () => void;
  cut: () => void;
  /** Paste into the supplied block, or into the single selected block. */
  paste: (targetBlockId?: BlockId) => void;
  canPaste: boolean;
}

/**
 * Hook providing in-memory copy, cut, paste, and duplicate actions for workspace blocks.
 */
export function useClipboard(): UseClipboardResult {
  const canPaste = useSyncExternalStore(
    subscribeClipboard,
    () => clipboardPayload.blocks.length > 0,
    () => false,
  );

  const copy = useCallback(() => {
    const { selectedBlockIds, blocks, blockOrder, connectors } = useWorkspaceStore.getState();
    if (selectedBlockIds.length === 0) return;

    // Copy a selected hierarchy node together with its descendants so paste
    // can preserve the complete branch instead of flattening it to one node.
    const copiedIds = new Set<BlockId>();
    for (const id of selectedBlockIds) {
      collectReferencedBlockIds(blocks, [id]).forEach((descendantId) => copiedIds.add(descendantId));
    }
    const orderedIds = [
      ...blockOrder.filter((id) => copiedIds.has(id)),
      ...[...copiedIds].filter((id) => !blockOrder.includes(id)),
    ];
    const clonedBlocks: CanvasBlock[] = [];
    for (const id of orderedIds) {
      const block = blocks[id];
      if (block) {
        clonedBlocks.push({ ...cloneValue(block), data: withoutTableAttachments(block) });
      }
    }

    if (clonedBlocks.length > 0) {
      const clonedConnectors = Object.values(connectors)
        .filter((connector) => copiedIds.has(connector.fromBlockId) && copiedIds.has(connector.toBlockId))
        .map((connector) => cloneValue(connector));
      setClipboard({ blocks: clonedBlocks, connectors: clonedConnectors });
      if (clonedBlocks.length === 1 && clonedBlocks[0].type === "image") {
        const image = clonedBlocks[0];
        if (!("url" in image.data)) return;
        const transform = resolveTransform(image.transform, DEFAULT_TRANSFORM);
        void writeWorkspaceImageToClipboard({
          url: image.data.url,
          width: transform.w,
          height: transform.h,
        });
      }
    }
  }, []);

  const cut = useCallback(() => {
    const { selectedBlockIds, blocks, blockOrder, connectors, removeBlock, removeConnector } =
      useWorkspaceStore.getState();
    if (useWorkspaceStore.getState().isReadOnly || selectedBlockIds.length === 0) return;

    // Cut carries the selected node(s) together with their full descendants.
    // De-duplicate overlapping selections (for example parent + child), so a
    // pasted branch remains a complete chain instead of collapsing to the
    // selected node alone.
    const cutIds = new Set<BlockId>();
    for (const id of selectedBlockIds) {
      collectReferencedBlockIds(blocks, [id]).forEach((descendantId) => cutIds.add(descendantId));
    }
    const clonedBlocks: CanvasBlock[] = [];
    const orderedIds = [
      ...blockOrder.filter((id) => cutIds.has(id)),
      ...[...cutIds].filter((id) => !blockOrder.includes(id)),
    ];
    for (const id of orderedIds) {
      const block = blocks[id];
      if (block) {
        clonedBlocks.push({ ...cloneValue(block), data: withoutTableAttachments(block) });
      }
    }

    if (clonedBlocks.length > 0) {
      const cutConnectors = Object.values(connectors)
        .filter((connector) => cutIds.has(connector.fromBlockId) && cutIds.has(connector.toBlockId))
        .map((connector) => cloneValue(connector));
      setClipboard({ blocks: clonedBlocks, connectors: cutConnectors });
    }

    const selectedSet = cutIds;

    // Remove any connector attached to any of the removed blocks
    Object.values(connectors).forEach((connector) => {
      if (selectedSet.has(connector.fromBlockId) || selectedSet.has(connector.toBlockId)) {
        removeConnector(connector.id);
      }
    });

    // Remove the complete cut subtree, not only the explicitly selected roots.
    cutIds.forEach((id) => {
      removeBlock(id);
    });
  }, []);

  const paste = useCallback((targetBlockId?: BlockId) => {
    if (useWorkspaceStore.getState().isReadOnly || clipboardPayload.blocks.length === 0) return;

    const { addBlock, addConnector, setSelection, blocks, selectedBlockIds } = useWorkspaceStore.getState();
    // Selection changes after Copy/Cut are intentional: selecting one block
    // before Ctrl/Cmd+V means "paste these blocks as its children". Keep the
    // optional argument for context-menu actions, whose target is explicit.
    const pasteTargetId = targetBlockId ?? (selectedBlockIds.length === 1 ? selectedBlockIds[0] : undefined);
    const targetData = pasteTargetId ? blocks[pasteTargetId]?.data : undefined;
    const containerTarget = targetData && "frameBlockIds" in targetData;
    const destinationId = containerTarget ? undefined : pasteTargetId;
    const pasteTarget = destinationId ? blocks[destinationId] : undefined;
    const now = Date.now();
    const newBlockIds: BlockId[] = [];
    const pastedRootIds: BlockId[] = [];
    const idMap = new Map<BlockId, BlockId>();
    clipboardPayload.blocks.forEach((block) => idMap.set(block.id, createBlockId()));

    clipboardPayload.blocks.forEach((block) => {
      const newId = idMap.get(block.id)!;
      const resolved = resolveTransform(block.transform, DEFAULT_TRANSFORM);
      const newTransform: Transform = {
        ...resolved,
        x: resolved.x + 24,
        y: resolved.y + 24,
      };
      const sourceMapRootId = findMapRootId(blocks, block.id);
      const sourceMapLayout = sourceMapRootId ? blocks[sourceMapRootId]?.mapLayout : undefined;
      const isClipboardRoot = !block.parentId || !idMap.has(block.parentId);
      const parentId = isClipboardRoot ? destinationId : idMap.get(block.parentId!);
      const isPastedMapRoot = !parentId;

      const newBlock: CanvasBlock = {
        id: newId,
        type: block.type,
        // A pasted tree must be laid out from its new parent. Keeping the
        // source position as an `override` makes resolveTransform prefer the
        // old absolute coordinates, so the reflow pass cannot move the
        // branch beside the destination node.
        transform: parentId ? createComputedTransform(newTransform) : createDualTransform(newTransform),
        data: remapContainerReferences(cloneValue(withoutTableAttachments(block)), idMap),
        ...(parentId ? { parentId } : {}),
        ...(block.style ? { style: cloneValue(block.style) } : {}),
        ...(block.icon ? { icon: block.icon } : {}),
        ...(block.description ? { description: block.description } : {}),
        ...(block.link ? { link: block.link } : {}),
        ...(block.attachedImages ? { attachedImages: cloneValue(block.attachedImages) } : {}),
        ...(block.isCollapsed !== undefined ? { isCollapsed: block.isCollapsed } : {}),
        ...(block.isFloating !== undefined ? { isFloating: block.isFloating } : {}),
        ...(isPastedMapRoot && sourceMapLayout ? { mapLayout: cloneValue(sourceMapLayout) } : {}),
        createdAt: now,
        updatedAt: now,
      };

      addBlock(newBlock);
      newBlockIds.push(newId);
      if (isClipboardRoot) pastedRootIds.push(newId);
    });

    // parentId is the structural source of truth, but connectors are also
    // persisted/rendered explicitly. Add the missing edge for each pasted
    // clipboard root when it was attached to a destination node.
    if (pasteTarget && pastedRootIds.length > 0) {
      const lineType = currentMapLayout(useWorkspaceStore.getState(), pasteTarget.id).connectorLineType;
      pastedRootIds.forEach((id) => {
        addConnector({ id: createConnectorId(), fromBlockId: pasteTarget.id, toBlockId: id, lineType });
      });
    }

    clipboardPayload.connectors.forEach((connector) => {
      const fromBlockId = idMap.get(connector.fromBlockId);
      const toBlockId = idMap.get(connector.toBlockId);
      if (!fromBlockId || !toBlockId) return;
      addConnector({
        ...cloneValue(connector),
        id: createConnectorId(),
        fromBlockId,
        toBlockId,
        ...(connector.waypoints
          ? { waypoints: connector.waypoints.map((point) => ({ x: point.x + 24, y: point.y + 24 })) }
          : {}),
      });
    });

    if (pasteTarget) {
      reflowWorkspaceTree(pasteTarget.id);
      const pastedMapRootId = findMapRootId(useWorkspaceStore.getState().blocks, pasteTarget.id);
      if (pastedMapRootId) restyleWorkspaceMapConnectors(pastedMapRootId);
    }

    // A copied subtree may start below the source map root. After paste its
    // root depth changes, so copied connector colors must be recalculated
    // against the new hierarchy instead of retaining the old depth index.
    const pastedState = useWorkspaceStore.getState();
    newBlockIds
      .filter((id) => !pastedState.blocks[id]?.parentId)
      .forEach((id) => restyleWorkspaceMapConnectors(id));

    setSelection(newBlockIds);
  }, []);

  return {
    copy,
    cut,
    paste,
    canPaste,
  };
}

export default useClipboard;
