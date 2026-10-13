"use client";

import { calculateAdjacentBlockPosition } from "../hooks/useBlockQuickAdd";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  createBlockId,
  createDualTransform,
  resolveTransform,
  type BlockStyle,
  type CanvasBlock,
  type Transform,
} from "../types/block";
import { createConnectorId } from "../types/connector";
import { collectSubtreeBlockIds, deleteSubtree } from "./treeSubtree";
import { commitWorkspaceReparent } from "../hooks/blockDragReparent";
import { duplicateWorkspaceSubtree, duplicateWorkspaceSubtreeAsMap } from "./workspaceDuplicateSubtree";
import { applyWorkspaceContentChatAction } from "./workspaceChatContentActions";
import { applyWorkspaceConnectNodes } from "./workspaceChatConnectorActions";
import { applyWorkspaceUpdateRelationship } from "./workspaceChatRelationshipActions";
import { applyWorkspaceExtendedChatAction } from "./workspaceChatExtendedActions";
import {
  asNumber,
  asRecord,
  firstString,
  normalizeLegacyActionPayload,
  normalizeStyle,
  resolveWorkspaceTargetIds,
} from "./workspaceChatResolver";
const TEXT_SIZE = { w: 170, h: 36 };
const IMAGE_SIZE = { w: 240, h: 160 };
const TABLE_SIZE = { w: 320, h: 180 };
const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
export interface WorkspaceDraftNode {
  topic: string;
  children: WorkspaceDraftNode[];
  description?: string;
  icon?: string;
  image?: string;
  style?: BlockStyle;
  table?: { rows: number; cols: number; cells: string[][] };
}

function normalizeTable(raw: unknown): WorkspaceDraftNode["table"] {
  const value = asRecord(raw);
  if (Object.keys(value).length === 0) return undefined;
  const rows = Math.max(1, Math.min(20, Number(value.rows) || 3));
  const cols = Math.max(1, Math.min(20, Number(value.cols ?? value.columns) || 3));
  const source = Array.isArray(value.cells) ? value.cells : [];
  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => String((source[row] as unknown[] | undefined)?.[col] ?? "")),
  );
  return { rows, cols, cells };
}

function normalizeNode(raw: unknown): WorkspaceDraftNode | null {
  if (typeof raw === "string") return { topic: raw.trim() || "Node", children: [] };
  const value = asRecord(raw);
  if (Object.keys(value).length === 0) return null;
  const topic = firstString(value.topic, value.name, value.text, value.label) ?? "Node";
  const children = Array.isArray(value.children)
    ? value.children.map(normalizeNode).filter((node): node is WorkspaceDraftNode => Boolean(node))
    : [];
  const image = firstString(value.image);
  return {
    topic,
    children,
    ...(firstString(value.description) ? { description: firstString(value.description) } : {}),
    ...(firstString(value.icon) ? { icon: firstString(value.icon) } : {}),
    ...(image ? { image } : {}),
    ...(normalizeStyle(value.style) ? { style: normalizeStyle(value.style) } : {}),
    ...(normalizeTable(value.table) ? { table: normalizeTable(value.table) } : {}),
  };
}

export function parseNodeDrafts(raw: Record<string, unknown>): WorkspaceDraftNode[] {
  const params = asRecord(raw.params);
  const directNodes = Array.isArray(raw.nodes)
    ? raw.nodes
    : Array.isArray(params.nodes)
      ? params.nodes
      : [];
  const root = directNodes.length > 0
    ? directNodes
    : raw.node !== undefined
      ? [raw.node]
      : raw.to !== undefined
        ? [raw.to]
        : params.node !== undefined
          ? [params.node]
          : params.to !== undefined
            ? [params.to]
            : [];
  return root.map(normalizeNode).filter((node): node is WorkspaceDraftNode => Boolean(node));
}

function getLineType() {
  const family = useWorkspaceStore.getState().treeLayoutFamily;
  return family === "treeview" || family === "orgchart"
    ? "orthogonal"
    : family === "timeline" || family === "fishbone"
      ? "straight"
      : "curved";
}

function createBlockFromDraft(
  draft: WorkspaceDraftNode,
  parentId: string | undefined,
  anchorTransform: Transform,
  zIndex: number,
): { id: string; transform: Transform } {
  const state = useWorkspaceStore.getState();
  const id = createBlockId();
  const size = draft.table ? TABLE_SIZE : draft.image ? IMAGE_SIZE : TEXT_SIZE;
  const pos = calculateAdjacentBlockPosition(anchorTransform, "right", size);
  const now = Date.now();
  const block: CanvasBlock = {
    id,
    type: draft.table ? "table" : draft.image ? "image" : "text",
    transform: createDualTransform({
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      w: size.w,
      h: size.h,
      rotation: 0,
      zIndex,
    }),
    data: draft.table
      ? draft.table
      : draft.image
        ? { url: draft.image, alt: draft.topic }
        : { markdown: draft.topic },
    ...(parentId ? { parentId } : {}),
    ...(draft.style ? { style: draft.style } : {}),
    ...(draft.description ? { description: draft.description } : {}),
    ...(draft.icon ? { icon: draft.icon } : {}),
    createdAt: now,
    updatedAt: now,
  } as CanvasBlock;
  state.addBlock(block);
  if (parentId) {
    state.addConnector({
      id: createConnectorId(),
      fromBlockId: parentId,
      fromSide: "right",
      toBlockId: id,
      toSide: "left",
      lineType: getLineType(),
    });
  }
  return { id, transform: resolveTransform(block.transform, DEFAULT_TRANSFORM) };
}

function appendDrafts(
  drafts: WorkspaceDraftNode[],
  parentId: string,
  sourceTransform: Transform,
  zIndexStart: number,
): string[] {
  const createdIds: string[] = [];
  let anchorTransform = sourceTransform;
  for (const draft of drafts) {
    const created = createBlockFromDraft(draft, parentId, anchorTransform, zIndexStart + createdIds.length);
    createdIds.push(created.id);
    anchorTransform = created.transform;
    if (draft.children.length > 0) {
      createdIds.push(...appendDrafts(draft.children, created.id, created.transform, zIndexStart + createdIds.length));
    }
  }
  return createdIds;
}

function applyUpdateNode(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  // Compared against a case-normalized type: the dispatcher above already
  // lowercases before routing here, so a model that sends "Update_Style" (or
  // any non-canonical casing) still reaches this function -- but comparing
  // against raw.type directly would silently fall back to a single target,
  // applying a "restyle every selected block" request to only one of them.
  const normalizedType = String(raw.type ?? "").toLowerCase();
  const targetIds = resolveWorkspaceTargetIds(raw, {
    allowMultiple: normalizedType === "update_style" || asRecord(raw.params).styleScope === "selected" || raw.styleScope === "selected",
  });
  if (targetIds.length === 0) return [];

  const { title, description, style, textData, x, y } = normalizeLegacyActionPayload(raw);
  const applied = new Set<string>();

  if (title !== undefined) {
    for (const id of targetIds) {
      const block = state.blocks[id];
      if (!block) continue;
      if (block.type === "text") {
        state.updateBlock(id, { data: { ...(block.data as Record<string, unknown>), markdown: title } });
        applied.add(id);
      }
    }
  }

  if (description !== undefined) {
    for (const id of targetIds) {
      if (state.blocks[id]) {
        state.updateBlock(id, { description });
        applied.add(id);
      }
    }
  }

  if (style) {
    for (const id of targetIds) {
      const block = state.blocks[id];
      if (block) {
        state.updateBlock(id, { style: { ...block.style, ...style } });
        applied.add(id);
      }
    }
  }

  if (textData) {
    for (const id of targetIds) {
      const block = state.blocks[id];
      if (block?.type === "text") {
        state.updateBlock(id, { data: { ...(block.data as Record<string, unknown>), ...textData } as CanvasBlock["data"] });
        applied.add(id);
      }
    }
  }

  if (x !== undefined && y !== undefined && targetIds.length === 1) {
    state.updateBlockTransform(targetIds[0], { x, y }, "override");
    applied.add(targetIds[0]);
  }

  return Array.from(applied);
}

// The schema instruction promises move_node "detach[es] from its tree
// parent", but until this fix it was routed through applyUpdateNode, which
// only ever touches title/description/style/x/y — never parentId. A model
// calling move_node with just a target produced zero effect: no field it
// updates changed, so the block silently stayed exactly where it was, tree
// connector and all. Detaching means the same thing drag-drop's own
// detachDraggedRoots (blockDragReparent.ts) does: drop the incoming
// structural connector from the old parent and clear parentId/isFloating.
//
// detachDraggedRoots never needed to reposition anything -- the user's own
// drag gesture already moved the block by hand before the detach logic ever
// runs. A chat-driven move_node has no such gesture: without an explicit
// reposition, the "detached" subtree is left sitting in exactly the same
// spot, still visually overlapping the tree it just left (found live: "tách
// nhánh này ra làm map độc lập" correctly cleared parentId/isFloating and
// removed the parent connector, but the branch stayed pixel-for-pixel where
// it was, reading as if nothing happened). Shifted the whole subtree — not
// just the target -- to a clear spot past every existing block, the same
// "maxX + 120" placement create_map already uses, so children keep their
// position relative to their (still-floating) root.
function applyMoveNodeAction(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  const targetIds = resolveWorkspaceTargetIds(raw);
  const applied: string[] = [];
  for (const id of targetIds) {
    const block = state.blocks[id];
    if (!block?.parentId || block.isFloating) continue;
    const oldParentId = block.parentId;
    const connector = Object.values(useWorkspaceStore.getState().connectors).find(
      (candidate) => candidate.fromBlockId === oldParentId && candidate.toBlockId === id,
    );
    if (connector) state.removeConnector(connector.id);
    state.updateBlock(id, { parentId: undefined, isFloating: true });
    applied.push(id);

    const subtreeIds = collectSubtreeBlockIds(id, useWorkspaceStore.getState().blocks);
    const allBlocks = Object.values(useWorkspaceStore.getState().blocks);
    const maxX = allBlocks.reduce((max, candidate) => {
      const transform = resolveTransform(candidate.transform, { x: 0, y: 0, ...TEXT_SIZE, rotation: 0, zIndex: 0 });
      return subtreeIds.has(candidate.id) ? max : Math.max(max, transform.x + transform.w);
    }, 0);
    const rootTransform = resolveTransform(block.transform, { x: 0, y: 0, ...TEXT_SIZE, rotation: 0, zIndex: 0 });
    const deltaX = maxX + 120 - rootTransform.x;
    for (const subtreeId of subtreeIds) {
      const subtreeBlock = useWorkspaceStore.getState().blocks[subtreeId];
      if (!subtreeBlock) continue;
      const transform = resolveTransform(subtreeBlock.transform, { x: 0, y: 0, ...TEXT_SIZE, rotation: 0, zIndex: 0 });
      state.updateBlockTransform(subtreeId, { x: transform.x + deltaX, y: transform.y }, "override");
    }
  }
  return applied;
}

// The other half of "detach": attach an already-existing block (or several)
// under a different existing parent. Not a new capability -- this is the
// exact same operation drag-drop already performs when you drop a block onto
// another one (commitWorkspaceReparent), just invoked from chat instead of a
// pointer gesture. Reuses that function as-is: reparent, connector rewiring,
// and layout reflow are all handled there, including the cycle guard
// (canReparentBlock) that refuses to attach a block under itself or under
// one of its own descendants.
function applyAttachToParentAction(raw: Record<string, unknown>): string[] {
  const targetIds = resolveWorkspaceTargetIds(raw, { allowMultiple: true });
  if (targetIds.length === 0) return [];
  const newParentValue = raw.newParent ?? asRecord(raw.params).newParent;
  if (newParentValue === undefined) return [];
  const newParentIds = resolveWorkspaceTargetIds({ target: newParentValue });
  const newParentId = newParentIds.length === 1 ? newParentIds[0] : undefined;
  if (!newParentId || targetIds.includes(newParentId)) return [];
  const success = commitWorkspaceReparent(newParentId, targetIds, "child");
  return success ? [...targetIds, newParentId] : [];
}

function applyAddAction(type: "add_child" | "add_sibling", raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  const targetIds = resolveWorkspaceTargetIds(raw);
  if (targetIds.length === 0) return [];
  const targetId = targetIds[0];
  const target = state.blocks[targetId];
  if (!target) return [];
  const parentId = type === "add_child" ? targetId : target.parentId;
  if (!parentId) return [];
  const parent = state.blocks[parentId];
  if (!parent) return [];
  const drafts = parseNodeDrafts(raw);
  if (drafts.length === 0) return [];
  const anchor = resolveTransform(type === "add_child" ? target.transform : parent.transform, DEFAULT_TRANSFORM);
  const createdIds = appendDrafts(drafts, parentId, anchor, state.blockOrder.length);
  if (createdIds.length > 0) state.setSelection(createdIds);
  return createdIds;
}

function applyDeleteAction(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  const targetIds = resolveWorkspaceTargetIds(raw);
  if (targetIds.length === 0) return [];
  const applied: string[] = [];
  for (const id of targetIds) {
    if (state.blocks[id]) {
      deleteSubtree(id);
      applied.push(id);
    }
  }
  return applied;
}

function applyDuplicateAction(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  const targetIds = resolveWorkspaceTargetIds(raw);
  if (targetIds.length !== 1) return [];
  const params = asRecord(raw.params);
  const offsetX = asNumber(raw.offsetX ?? params.offsetX);
  const offsetY = asNumber(raw.offsetY ?? params.offsetY);
  const targetId = targetIds[0];
  if (!state.blocks[targetId]) return [];
  return duplicateWorkspaceSubtree(targetId, { offsetX, offsetY });
}

export function applyWorkspaceLegacyChatAction(raw: Record<string, unknown>): string[] {
  const state = useWorkspaceStore.getState();
  if (state.isReadOnly) return [];

  const type = String(raw.type ?? "").toLowerCase();
  if (
    type === "update_node" ||
    type === "rename_topic" ||
    type === "update_description" ||
    type === "update_style"
  ) {
    return applyUpdateNode(raw);
  }
  if (type === "move_node") {
    return applyMoveNodeAction(raw);
  }
  if (type === "attach_to_parent") {
    return applyAttachToParentAction(raw);
  }
  if (type === "add_child" || type === "add_sibling") {
    return applyAddAction(type, raw);
  }
  if (type === "delete_node") {
    return applyDeleteAction(raw);
  }
  if (type === "duplicate_node") {
    return applyDuplicateAction(raw);
  }
  if (type === "duplicate_map" || type === "copy_branch_to_map") {
    const targetIds = resolveWorkspaceTargetIds(raw);
    return targetIds.length === 1 ? duplicateWorkspaceSubtreeAsMap(targetIds[0]) : [];
  }
  if (type === "update_image" || type === "update_icon") {
    return applyWorkspaceContentChatAction(type, raw);
  }
  if (type === "connect_nodes") {
    return applyWorkspaceConnectNodes(raw);
  }
  if (type === "update_relationship") return applyWorkspaceUpdateRelationship(raw);
  const extendedResult = applyWorkspaceExtendedChatAction(raw);
  if (extendedResult !== undefined) return extendedResult;
  return [];
}
