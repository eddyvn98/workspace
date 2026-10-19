"use client";

import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  createBlockId,
  resolveTransform,
  type BlockId,
  type CanvasBlock,
  type DualTransform,
  type Transform,
} from "../types/block";
import { createConnectorId, type CanvasConnector } from "../types/connector";
import { remapWorkspaceDocReferences } from './workspaceDocReferences';
import { collectReferencedBlockIds, remapContainerReferences } from './blockReferences';

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
const DEFAULT_OFFSET = { x: 24, y: 24 };

function cloneValue<T>(data: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(data);
    } catch {
      // Fallback
    }
  }
  return JSON.parse(JSON.stringify(data));
}

function getLineType() {
  const family = useWorkspaceStore.getState().treeLayoutFamily;
  return family === "treeview" || family === "orgchart"
    ? "orthogonal"
    : family === "timeline" || family === "fishbone"
      ? "straight"
      : "curved";
}

export interface DuplicateSubtreeOptions {
  offsetX?: number;
  offsetY?: number;
  asNewMap?: boolean;
  select?: boolean;
}

export function duplicateWorkspaceSubtree(
  targetId: BlockId,
  options: DuplicateSubtreeOptions = {}
): string[] {
  const state = useWorkspaceStore.getState();
  if (state.isReadOnly) return [];

  const targetBlock = state.blocks[targetId];
  if (!targetBlock) return [];

  const subtreeIds = new Set(collectReferencedBlockIds(state.blocks, [targetId]));
  if (subtreeIds.size === 0) return [];

  const offsetX = options.offsetX ?? DEFAULT_OFFSET.x;
  const offsetY = options.offsetY ?? DEFAULT_OFFSET.y;
  const now = Date.now();
  const originalOrder = state.blockOrder.slice();
  const idMap = new Map<BlockId, BlockId>();

  for (const origId of subtreeIds) {
    idMap.set(origId, createBlockId());
  }

  const orderedOriginalIds = state.blockOrder.filter((id) => subtreeIds.has(id));
  for (const id of subtreeIds) {
    if (!orderedOriginalIds.includes(id)) {
      orderedOriginalIds.push(id);
    }
  }

  const baseZIndex = state.blockOrder.length + 1;
  const createdBlocks: CanvasBlock[] = [];

  for (let i = 0; i < orderedOriginalIds.length; i += 1) {
    const origId = orderedOriginalIds[i];
    const origBlock = state.blocks[origId];
    if (!origBlock) continue;

    const newId = idMap.get(origId)!;

    let clonedParentId: BlockId | undefined;
    if (origId === targetId) {
      if (!options.asNewMap && origBlock.parentId && state.blocks[origBlock.parentId]) {
        clonedParentId = origBlock.parentId;
      }
    } else if (origBlock.parentId && idMap.has(origBlock.parentId)) {
      clonedParentId = idMap.get(origBlock.parentId);
    } else if (origBlock.parentId && state.blocks[origBlock.parentId]) {
      clonedParentId = origBlock.parentId;
    }

    const zIndex = baseZIndex + i;
    const computed = origBlock.transform.computed
      ? {
          ...origBlock.transform.computed,
          x: Math.round(origBlock.transform.computed.x + offsetX),
          y: Math.round(origBlock.transform.computed.y + offsetY),
          zIndex,
        }
      : null;

    const override = origBlock.transform.override
      ? {
          ...origBlock.transform.override,
          x: Math.round(origBlock.transform.override.x + offsetX),
          y: Math.round(origBlock.transform.override.y + offsetY),
          zIndex,
        }
      : null;

    const fallback = resolveTransform(origBlock.transform, DEFAULT_TRANSFORM);
    const clonedTransform: DualTransform =
      computed || override
        ? { computed, override }
        : {
            computed: null,
            override: {
              ...fallback,
              x: Math.round(fallback.x + offsetX),
              y: Math.round(fallback.y + offsetY),
              zIndex,
            },
          };

    const clonedBlock: CanvasBlock = remapWorkspaceDocReferences({
      id: newId,
      type: origBlock.type,
      transform: clonedTransform,
      data: remapContainerReferences(cloneValue(origBlock.data), idMap),
      ...(origBlock.embeddedInDocId ? { embeddedInDocId: origBlock.embeddedInDocId } : {}),
      ...(clonedParentId ? { parentId: clonedParentId } : {}),
      ...(origBlock.style ? { style: cloneValue(origBlock.style) } : {}),
      ...(origBlock.description ? { description: origBlock.description } : {}),
      ...(origBlock.icon ? { icon: origBlock.icon } : {}),
      ...(origBlock.link ? { link: origBlock.link } : {}),
      ...(origBlock.attachedImages ? { attachedImages: cloneValue(origBlock.attachedImages) } : {}),
      createdAt: now,
      updatedAt: now,
    } as CanvasBlock, idMap);

    createdBlocks.push(clonedBlock);
  }

  for (const block of createdBlocks) {
    state.addBlock(block);
  }

  for (const connector of Object.values(state.connectors)) {
    if (subtreeIds.has(connector.fromBlockId) && subtreeIds.has(connector.toBlockId)) {
      const newFrom = idMap.get(connector.fromBlockId)!;
      const newTo = idMap.get(connector.toBlockId)!;
      const clonedConnector: CanvasConnector = {
        ...connector,
        id: createConnectorId(),
        fromBlockId: newFrom,
        toBlockId: newTo,
        ...(connector.waypoints
          ? {
              waypoints: connector.waypoints.map((pt) => ({
                x: Math.round(pt.x + offsetX),
                y: Math.round(pt.y + offsetY),
              })),
            }
          : {}),
      };
      state.addConnector(clonedConnector);
    }
  }

  const newTargetId = idMap.get(targetId)!;
  if (!options.asNewMap && targetBlock.parentId && state.blocks[targetBlock.parentId]) {
    const parentId = targetBlock.parentId;
    const existingParentConnectors = Object.values(state.connectors).filter(
      (c) =>
        (c.fromBlockId === parentId && c.toBlockId === targetId) ||
        (c.toBlockId === parentId && c.fromBlockId === targetId)
    );

    if (existingParentConnectors.length > 0) {
      for (const parentConn of existingParentConnectors) {
        const clonedParentConnector: CanvasConnector = {
          ...parentConn,
          id: createConnectorId(),
          fromBlockId: parentConn.fromBlockId === targetId ? newTargetId : parentConn.fromBlockId,
          toBlockId: parentConn.toBlockId === targetId ? newTargetId : parentConn.toBlockId,
        };
        state.addConnector(clonedParentConnector);
      }
    } else {
      state.addConnector({
        id: createConnectorId(),
        fromBlockId: parentId,
        fromSide: "right",
        toBlockId: newTargetId,
        toSide: "left",
        lineType: getLineType(),
      });
    }
  }

  const createdIds = [newTargetId, ...createdBlocks.map((b) => b.id).filter((id) => id !== newTargetId)];
  if (createdIds.length > 0) {
    const subtreeOrderIndexes = orderedOriginalIds
      .map((id) => originalOrder.indexOf(id))
      .filter((index) => index >= 0);
    const insertAt = subtreeOrderIndexes.length > 0
      ? Math.max(...subtreeOrderIndexes) + 1
      : originalOrder.length;
    const nextOrder = originalOrder.slice();
    nextOrder.splice(insertAt, 0, ...createdIds);
    state.setBlockOrder(nextOrder);
    if (options.select !== false) state.setSelection(createdIds);
  }

  return createdIds;
}

export function duplicateWorkspaceSubtreeAsMap(targetId: BlockId): string[] {
  const state = useWorkspaceStore.getState();
  const target = state.blocks[targetId];
  if (!target) return [];
  const targetRect = resolveTransform(target.transform, DEFAULT_TRANSFORM);
  const maxX = Object.values(state.blocks).reduce((max, block) => {
    const rect = resolveTransform(block.transform, DEFAULT_TRANSFORM);
    return Math.max(max, rect.x + rect.w);
  }, 0);
  return duplicateWorkspaceSubtree(targetId, {
    offsetX: maxX + 120 - targetRect.x,
    offsetY: 0,
    asNewMap: true,
  });
}
