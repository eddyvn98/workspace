"use client";

import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { createBlockId, createComputedTransform, resolveTransform, type BlockId, type CanvasBlock } from "../types/block";
import { createConnectorId } from "../types/connector";
import { reflowWorkspaceTree } from "../layout/reflowWorkspaceTree";
import { currentMapLayout, findMapRootId } from "../layout/mapRoot";
import { familyAutoArranges } from "../layout/familyPositions";
import { findFreeFormSpot } from "../layout/freeFormPlacement";
import { restyleWorkspaceMapConnectors } from "../connectors/restyleWorkspaceMapConnectors";

const NEW_NODE_SIZE = { w: 170, h: 36 };

export interface TreeAutoArrangeApi {
  addChildBlock: (parentId: BlockId) => void;
  addChildBlockWithText: (parentId: BlockId, markdown: string) => BlockId | null;
  addSiblingBlock: (blockId: BlockId, placement?: "before" | "after") => void;
  addParentBlock: (blockId: BlockId) => void;
  addSummaryBlock: (parentId: BlockId) => void;
  splitBlockToNewMap: (blockId: BlockId) => void;
}

/** Tab (add child) / Enter (add sibling) mindmap authoring flow on top of
 *  the flat block model — see CONTRACTS.md §24 and §36. */
export function useTreeAutoArrange(): TreeAutoArrangeApi {
  const reflowTree = useCallback((rootHint: BlockId) => {
    reflowWorkspaceTree(rootHint);
  }, []);

  // Legacy's Tab/Enter add-child always commits "New Node" as the topic
  // (useNodeCreationActions.ts's handleAddChild: `{ id: newId, topic: "New
  // Node", children: [] }`), same as the click "+" quick-add — never an
  // empty string. An empty default here rendered the "Type text here..."
  // placeholder only for Tab/Enter-created nodes, inconsistent with "+".
  const createChildOf = useCallback((
    parentId: BlockId,
    markdown = "New Node",
    siblingPlacement?: { blockId: BlockId; placement: "before" | "after" },
    styleSourceId: BlockId = parentId,
    // A node the user is about to name opens its editor; one whose text
    // already arrived (an AI expansion, an import) must not, or a batch of
    // children would leave the last one stuck in edit mode.
    startEditing = true,
  ) => {
    const state = useWorkspaceStore.getState();
    if (state.isReadOnly || !state.blocks[parentId]) return null;

    const styleSource = state.blocks[styleSourceId];
    const newId = createBlockId();
    const now = Date.now();
    const layout = currentMapLayout(state, parentId);
    // A free-form map has no layout pass to place this node, so pick a real
    // spot next to the parent now — otherwise it would sit at the origin.
    const isFreeForm = !familyAutoArranges(layout.family);
    const sourceTransform = resolveTransform(state.blocks[parentId].transform, { ...NEW_NODE_SIZE, x: 0, y: 0, rotation: 0, zIndex: 0 });
    const freeFormSize = { w: sourceTransform.w, h: sourceTransform.h };
    const childSide = layout.family === "swimlane"
      ? (layout.direction === "down" || layout.direction === "up" ? "bottom" : "right")
      : (layout.direction === "down" || layout.direction === "up" ? "bottom" : "right");
    const childSize = isFreeForm ? freeFormSize : NEW_NODE_SIZE;
    const spot = isFreeForm
      ? findFreeFormSpot(state.blocks, parentId, childSize, childSide)
      : { x: 0, y: 0 };
    const newBlock: CanvasBlock<"text"> = {
      id: newId,
      type: "text",
      transform: createComputedTransform({ ...childSize, ...spot, rotation: 0, zIndex: 0 }),
      data: { markdown },
      style: styleSource?.style ? { ...styleSource.style } : undefined,
      parentId,
      createdAt: now,
      updatedAt: now,
    };
    state.addBlock(newBlock);
    const lineType = layout.connectorLineType;
    const connectorSide = isFreeForm ? childSide : undefined;
    const oppositeSide = connectorSide === "right" ? "left" : connectorSide === "bottom" ? "top" : undefined;
    state.addConnector({
      id: createConnectorId(),
      fromBlockId: parentId,
      toBlockId: newId,
      ...(connectorSide ? { fromSide: connectorSide } : {}),
      ...(oppositeSide ? { toSide: oppositeSide } : {}),
      lineType,
      ...(isFreeForm ? { arrowEnd: true } : {}),
    });
    if (siblingPlacement) {
      const nextOrder = useWorkspaceStore.getState().blockOrder.filter((id) => id !== newId);
      const targetIndex = nextOrder.indexOf(siblingPlacement.blockId);
      if (targetIndex >= 0) {
        nextOrder.splice(targetIndex + (siblingPlacement.placement === "after" ? 1 : 0), 0, newId);
        useWorkspaceStore.getState().setBlockOrder(nextOrder);
      }
    }
    state.setSelection([newId]);
    if (startEditing) state.setPendingEditBlockId(newId);
    if (!isFreeForm) reflowTree(parentId);
    restyleWorkspaceMapConnectors(parentId);
    return newId;
  }, [reflowTree]);

  const addChildBlock = useCallback(
    (parentId: BlockId) => createChildOf(parentId),
    [createChildOf]
  );

  /** Adds a child whose text is already known, without opening its editor —
   *  used by the AI expand flow. */
  const addChildBlockWithText = useCallback(
    (parentId: BlockId, markdown: string) =>
      createChildOf(parentId, markdown, undefined, parentId, false),
    [createChildOf]
  );

  const addSiblingBlock = useCallback(
    (blockId: BlockId, placement: "before" | "after" = "after") => {
      const parentId = useWorkspaceStore.getState().blocks[blockId]?.parentId;
      // Legacy Enter on the document/map root creates a child; only a
      // non-root node gets a sibling inserted beside it.
      if (!parentId) {
        createChildOf(blockId);
        return;
      }
      createChildOf(parentId, "New Node", { blockId, placement }, blockId);
    },
    [createChildOf]
  );

  const addParentBlock = useCallback((blockId: BlockId) => {
    const state = useWorkspaceStore.getState();
    if (state.isReadOnly) return;
    const block = state.blocks[blockId];
    if (!block || !block.parentId) return;

    const parentId = block.parentId;
    const blockTransform = resolveTransform(block.transform, { ...NEW_NODE_SIZE, x: 0, y: 0, rotation: 0, zIndex: 0 });
    const inherited = Object.values(state.connectors).find(
      (connector) => connector.fromBlockId === parentId && connector.toBlockId === blockId,
    );
    if (inherited) state.removeConnector(inherited.id);

    const newId = createBlockId();
    const now = Date.now();
    state.addBlock({
      id: newId,
      type: "text",
      transform: createComputedTransform({
        ...NEW_NODE_SIZE,
        w: blockTransform.w,
        h: blockTransform.h,
        x: 0,
        y: 0,
        rotation: 0,
        zIndex: 0,
      }),
      data: { markdown: "Merged Topic" },
      style: block.style ? { ...block.style } : undefined,
      parentId,
      createdAt: now,
      updatedAt: now,
    });
    // insertParentNode replaces the selected child at its existing sibling
    // index. addBlock appends by default, so move the new parent into that
    // exact slot before reflow; otherwise adding a parent silently reorders
    // the surrounding branches.
    const nextOrder = useWorkspaceStore.getState().blockOrder.filter((id) => id !== newId);
    const childIndex = nextOrder.indexOf(blockId);
    if (childIndex >= 0) nextOrder.splice(childIndex, 0, newId);
    else nextOrder.push(newId);
    useWorkspaceStore.getState().setBlockOrder(nextOrder);
    state.updateBlock(blockId, { parentId: newId });
    // The old parent→child edge may contain a manually edited path or label.
    // Those belong to the replaced edge, not to either new structural edge;
    // preserve only its visual style while letting the layout recompute ports.
    const baseConnector = inherited
      ? {
        strokeColor: inherited.strokeColor,
        strokeWidth: inherited.strokeWidth,
        dashed: inherited.dashed,
        arrowStart: inherited.arrowStart,
        arrowEnd: inherited.arrowEnd,
        lineType: inherited.lineType,
      }
      : {};
    const replacementConnectorIds = [createConnectorId(), createConnectorId()];
    state.addConnector({
      ...baseConnector,
      id: replacementConnectorIds[0],
      fromBlockId: parentId ?? newId,
      toBlockId: newId,
    });
    state.addConnector({
      ...baseConnector,
      id: replacementConnectorIds[1],
      fromBlockId: newId,
      toBlockId: blockId,
    });
    state.setSelection([newId]);
    state.setPendingEditBlockId(newId);
    if (familyAutoArranges(currentMapLayout(state, parentId ?? newId).family)) {
      reflowTree(parentId ?? newId);
    }
    restyleWorkspaceMapConnectors(parentId ?? newId);
    if (inherited) {
      useWorkspaceStore.setState((current) => current.isReadOnly ? current : {
        connectors: Object.fromEntries(Object.values(current.connectors).map((connector) =>
          replacementConnectorIds.includes(connector.id)
            ? [connector.id, {
              ...connector,
              strokeColor: inherited.strokeColor,
              strokeWidth: inherited.strokeWidth,
              dashed: inherited.dashed,
              arrowStart: inherited.arrowStart,
              arrowEnd: inherited.arrowEnd,
            }]
            : [connector.id, connector],
        )),
      });
    }
  }, [reflowTree]);

  const addSummaryBlock = useCallback(
    (parentId: BlockId) => {
      createChildOf(parentId, "💬 Content Summary");
    },
    [createChildOf],
  );

  const splitBlockToNewMap = useCallback((blockId: BlockId) => {
    const state = useWorkspaceStore.getState();
    const block = state.blocks[blockId];
    if (state.isReadOnly || !block?.parentId) return;

    const blockLabel = block.type === "text" && "markdown" in block.data ? block.data.markdown : blockId;
    const confirmed = typeof window === "undefined" || window.confirm(`Split "${blockLabel}" to a new map?`);
    if (!confirmed) return;

    const sourceRootId = findMapRootId(state.blocks, blockId);
    if (!sourceRootId) return;
    const sourceLayout = currentMapLayout(state, sourceRootId);
    Object.values(state.connectors).forEach((connector) => {
      if (connector.fromBlockId === block.parentId && connector.toBlockId === blockId) {
        state.removeConnector(connector.id);
      }
    });
    const movedIds = new Set<BlockId>();
    const collectSubtree = (id: BlockId) => {
      if (movedIds.has(id)) return;
      movedIds.add(id);
      Object.values(state.blocks).forEach((candidate) => {
        if (candidate.parentId === id) collectSubtree(candidate.id);
      });
    };
    collectSubtree(blockId);
    state.updateBlock(blockId, { parentId: undefined, mapLayout: sourceLayout });
    const nextOrder = useWorkspaceStore.getState().blockOrder.filter((id) => id !== blockId);
    nextOrder.push(blockId);
    useWorkspaceStore.getState().setBlockOrder(nextOrder);
    useWorkspaceStore.setState((current) => current.isReadOnly ? current : {
      blocks: Object.fromEntries(Object.values(current.blocks).map((candidate) =>
        movedIds.has(candidate.id)
          ? [candidate.id, { ...candidate, transform: { ...candidate.transform, override: null } }]
          : [candidate.id, candidate]
      )),
    });
    reflowWorkspaceTree(sourceRootId);
    reflowWorkspaceTree(blockId, sourceLayout);
    state.setSelection([blockId]);
  }, []);

  return { addChildBlock, addChildBlockWithText, addSiblingBlock, addParentBlock, addSummaryBlock, splitBlockToNewMap };
}

export default useTreeAutoArrange;
