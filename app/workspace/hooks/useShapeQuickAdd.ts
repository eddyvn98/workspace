"use client";

import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import {
  createBlockId,
  createDualTransform,
  resolveTransform,
  type BlockId,
  type CanvasBlock,
  type Transform,
} from "../types/block";
import { createConnectorId } from "../types/connector";
import { type QuickAddDirection } from "./useBlockQuickAdd";
import { canQuickAddConnect, findNearestBlockInDirection, findOpenPositionInDirection } from "../layout/shapeAdjacency";
import { resolveShapeConnectorLineType } from "../connectors/connectorStyle";
import { restyleWorkspaceMapConnectors } from "../connectors/restyleWorkspaceMapConnectors";
import { currentMapLayout } from "../layout/mapRoot";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

export type ShapeQuickAddPreview =
  | { kind: "connect"; targetId: BlockId }
  | { kind: "create" };

/** Shapes are freeform (no tree/parentId), so unlike useBlockQuickAdd's
 *  child/parent/sibling roles, a shape's "+" only ever does one of two
 *  things: reach for whatever already sits in that direction, or place a new
 *  shape there. "Reach for" only fires when the aligned neighbor is closing a
 *  loop back to the source's own existing chain (see canQuickAddConnect) -
 *  everything else, including a shape that merely lines up by coincidence
 *  (e.g. a parallel swimlane lane's step), creates fresh instead. */
export function previewShapeQuickAdd(blockId: BlockId, direction: QuickAddDirection): ShapeQuickAddPreview {
  const state = useWorkspaceStore.getState();
  const match = findNearestBlockInDirection(blockId, direction, state.blocks);
  if (match && canQuickAddConnect(blockId, match.blockId, state.connectors)) {
    return { kind: "connect", targetId: match.blockId };
  }
  return { kind: "create" };
}

export function useShapeQuickAdd(blockId: BlockId) {
  const quickAdd = useCallback(
    (direction: QuickAddDirection) => {
      const state = useWorkspaceStore.getState();
      if (state.isReadOnly) return null;
      const sourceBlock = state.blocks[blockId];
      if (!sourceBlock) return null;

      const preview = previewShapeQuickAdd(blockId, direction);
      // A shape has no map of its own to remember a line style on, so match
      // whichever style already touches this block's existing connectors
      // (e.g. the orthogonal chain from earlier quick-adds) instead of
      // silently falling back to the unrelated global default the moment
      // there's no per-map setting to inherit - see resolveShapeConnectorLineType.
      const lineType = resolveShapeConnectorLineType(
        state.connectors,
        blockId,
        currentMapLayout(state, blockId).connectorLineType,
      );
      // Same inheritance as lineType above: match whichever stroke color
      // already touches this shape instead of falling back to the
      // renderer's unstyled default.
      const existingConnector = Object.values(state.connectors).find(
        (connector) => connector.fromBlockId === blockId || connector.toBlockId === blockId,
      );
      const strokeColor = existingConnector?.strokeColor;

      if (preview.kind === "connect") {
        const connectorId = createConnectorId();
        state.addConnector({
          id: connectorId,
          fromBlockId: blockId,
          toBlockId: preview.targetId,
          // No fromSide/toSide. Only when lineType is "orthogonal" does
          // computeConnectorGeometry run its obstacle-aware auto-routing; a
          // curved/straight match draws directly like any other manually
          // drawn connector of that style.
          lineType,
          arrowEnd: true,
          ...(strokeColor ? { strokeColor } : {}),
        });
        restyleWorkspaceMapConnectors(blockId, new Set([preview.targetId]));
        state.setSelectedConnectorId(connectorId);
        state.setSelection([]);
        return preview.targetId;
      }

      const sourceTransform = resolveTransform(sourceBlock.transform, DEFAULT_TRANSFORM);
      const targetPos = findOpenPositionInDirection(blockId, direction, state.blocks, {
        w: sourceTransform.w,
        h: sourceTransform.h,
      });
      const newId = createBlockId();
      const now = Date.now();
      const shapeData = sourceBlock.type === "shape"
        ? (sourceBlock as CanvasBlock<"shape">).data
        : { shapeKind: "rounded" as const };
      const newBlock: CanvasBlock<"shape"> = {
        id: newId,
        type: "shape",
        transform: createDualTransform({
          x: Math.round(targetPos.x),
          y: Math.round(targetPos.y),
          w: Math.round(sourceTransform.w),
          h: Math.round(sourceTransform.h),
          rotation: 0,
          zIndex: state.blockOrder.length,
        }),
        data: { shapeKind: shapeData.shapeKind },
        style: sourceBlock.style ? { ...sourceBlock.style } : undefined,
        createdAt: now,
        updatedAt: now,
      };
      state.addBlock(newBlock);
      const connectorId = createConnectorId();
      state.addConnector({
        id: connectorId,
        fromBlockId: blockId,
        toBlockId: newId,
        // Pinned to the side findOpenPositionInDirection actually placed the
        // shape on (which is only `direction` itself when the straight spot
        // was free) - otherwise an unpinned connector would leave from
        // `direction`'s side regardless, hugging whatever connector already
        // goes that way (e.g. the one to the blocking shape this one routed
        // around) instead of the side this shape is really reachable from.
        fromSide: targetPos.fromSide,
        toSide: targetPos.toSide,
        // Only set when the shape landed off the straight axis - pins the
        // bend to a fixed trunk line shared by every branch off this same
        // source/direction, instead of each connector's path being decided
        // independently by the generic obstacle-avoiding router (see
        // findOpenPositionInDirection's trunkAxis doc comment).
        trunkAxis: targetPos.trunkAxis,
        lineType,
        arrowEnd: true,
        ...(strokeColor ? { strokeColor } : {}),
      });
      restyleWorkspaceMapConnectors(blockId, new Set([newId]));
      state.setSelection([newId]);
      // Keep the source handle authoritative while the pointer is still on
      // it. The newly-selected shape's opposite handle can otherwise land on
      // the same screen point and steal the next click in a flowchart.
      const family = currentMapLayout(state, blockId).family;
      if (family === "flowchart" || family === "swimlane") {
        state.setQuickAddHandoff({ blockId, direction });
      }
      // See useShapeDrawToSize's onPointerUp: a freshly created shape isn't
      // yet a settled double-click target, so an immediate double-click to
      // label it would type nothing without this.
      state.setPendingEditBlockId(newId);
      return newId;
    },
    [blockId],
  );

  return { quickAdd };
}

export default useShapeQuickAdd;
