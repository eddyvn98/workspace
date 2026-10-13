"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type { BlockId } from "../types/block";
import { createConnectorId, type AnchorSide } from "../types/connector";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { clientToWorkspaceWorld, resolveConnectorDropTarget, resolveExplicitConnectorDropTarget } from "../connectors/connectorPointer";
import { pickFacingSide } from "../connectors/anchorRegistry";
import { resolveConnectorCreationLineType } from "../connectors/connectorCreationStyle";
import { blockWorldRect } from "../connectors/blockWorldRect";
import { imageFlowConnectionError } from "../connectors/imageFlowConnection";
import { isImageFlowBlock } from "../types/imageFlow";
import { toast } from "sonner";

function isCanvasImageBlock(block: import("../types/block").CanvasBlock | undefined): block is import("../types/block").CanvasBlock<"image"> {
  return block?.type === "image";
}

export function useConnectorDrag(blockId: BlockId) {
  const startPendingConnector = useWorkspaceStore((state) => state.startPendingConnector);
  const clearPendingConnector = useWorkspaceStore((state) => state.clearPendingConnector);
  const addConnector = useWorkspaceStore((state) => state.addConnector);
  const setSelectedConnectorId = useWorkspaceStore((state) => state.setSelectedConnectorId);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const pendingConnectorFrom = useWorkspaceStore((state) => state.pendingConnectorFrom);

  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const previewPointRef = useRef<{ x: number; y: number } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const startConnectorDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>, fromSide?: AnchorSide) => {
      if (e.button !== 0) return;
      if (useWorkspaceStore.getState().isReadOnly) return;
      e.stopPropagation();

      startPendingConnector(blockId, fromSide);
      const initialPoint = { x: e.clientX, y: e.clientY };
      previewPointRef.current = initialPoint;
      setPreviewPoint(initialPoint);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const point = { x: moveEvent.clientX, y: moveEvent.clientY };
        previewPointRef.current = point;
        setPreviewPoint(point);
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        if (cleanupRef.current) {
          cleanupRef.current();
          cleanupRef.current = null;
        }

        const dropPoint = clientToWorkspaceWorld({ x: upEvent.clientX, y: upEvent.clientY });
        const explicitTarget = resolveExplicitConnectorDropTarget(
          useWorkspaceStore.getState().blocks,
          blockId,
          { x: upEvent.clientX, y: upEvent.clientY },
        );
        const resolvedTarget = explicitTarget ?? resolveConnectorDropTarget(
          useWorkspaceStore.getState().blocks,
          blockId,
          dropPoint,
        );
        const targetBlockId: string | null = resolvedTarget?.blockId ?? null;
        const toSide: AnchorSide | undefined = resolvedTarget?.side;
        if (targetBlockId && targetBlockId !== blockId) {
          const activeTool = useWorkspaceStore.getState().activeConnectorTool;
          const sourceRect = blockWorldRect(useWorkspaceStore.getState().blocks, blockId);
          // The live preview chooses the source edge from the final pointer
          // position when the drag started on the block body. Persist that
          // exact choice so computeConnectorGeometry cannot switch edges to
          // the target's centre after mouseup.
          const resolvedFromSide = fromSide ?? (sourceRect
            ? pickFacingSide(sourceRect, new DOMRect(dropPoint.x, dropPoint.y, 0, 0))
            : undefined);
		  const current = useWorkspaceStore.getState();
			  const sourceBlock = current.blocks[blockId];
			  const targetBlock = current.blocks[targetBlockId];
			  const sourceImage = isCanvasImageBlock(sourceBlock) ? sourceBlock : undefined;
			  const referenceTarget = isImageFlowBlock(targetBlock) && targetBlock.data.stepKind === "reference" ? targetBlock : undefined;
			  const isImageFlowConnection = isImageFlowBlock(sourceBlock) && isImageFlowBlock(targetBlock);
			  const isImageFlowInputConnection = Boolean(sourceImage && referenceTarget);
		  const imageInputSlot = sourceImage && referenceTarget
		    ? !(referenceTarget.data.mainImages?.length ?? Number(Boolean(referenceTarget.data.mainImage))) ? "mainImage" : "referenceImage"
			    : null;
			  const isImageFlowOutputConnection = isImageFlowBlock(sourceBlock)
			    && sourceBlock.data.stepKind === "generate"
			    && isCanvasImageBlock(targetBlock)
			    && targetBlock.data.imageFlowOrigin?.generateBlockId === sourceBlock.id;
          const newConnectorId = createConnectorId();
		  const connector = {
            id: newConnectorId,
            fromBlockId: blockId,
            toBlockId: targetBlockId,
            fromSide: resolvedFromSide,
            toSide,
            lineType: resolveConnectorCreationLineType(useWorkspaceStore.getState(), blockId),
            // A plain connector drag matches the legacy mindmap default:
            // arrowheads appear only when the explicit arrow tool/style is used.
            arrowEnd: activeTool?.arrowEnd ?? false,
			    ...(isImageFlowConnection || isImageFlowInputConnection || isImageFlowOutputConnection || activeTool?.kind === "image-flow" ? { kind: "image-flow" as const, strokeColor: "#8b5cf6", dashed: true, arrowEnd: true } : {}),
		  };
		  const error = imageFlowConnectionError(current.blocks, current.connectors, connector);
		  if (error) {
		    toast.error(error);
		  } else if (addConnector(connector)) {
		    const source = current.blocks[connector.fromBlockId];
		    const target = current.blocks[connector.toBlockId];
		    const connectedImage = isCanvasImageBlock(source) ? source : undefined;
		    if (connectedImage && isImageFlowBlock(target) && target.data.stepKind === "reference" && imageInputSlot) {
		      const imageInput = { url: connectedImage.data.url, downloadUrl: connectedImage.data.downloadUrl, name: connectedImage.data.alt || "Workspace image", resourceId: connectedImage.data.resourceId, blockId: connectedImage.id };
		      const existing = imageInputSlot === "mainImage" ? target.data.mainImages ?? (target.data.mainImage ? [target.data.mainImage] : []) : target.data.referenceImages ?? (target.data.referenceImage ? [target.data.referenceImage] : []);
		      useWorkspaceStore.getState().updateBlock(target.id, { data: { ...target.data, ...(imageInputSlot === "mainImage" ? { mainImages: [...existing, imageInput], mainImage: undefined } : { referenceImages: [...existing, imageInput], referenceImage: undefined, referenceBlockId: undefined }) } });
		    }
		    if (isImageFlowBlock(source) && isImageFlowBlock(target) && target.data.stepKind === "advanced" && target.data.advancedLevel !== "mode") {
		      useWorkspaceStore.getState().updateBlock(target.id, { data: { ...target.data, parentBlockId: source.id } });
		    }
		    setSelectedConnectorId(newConnectorId);
		    setSelection([]);
		  }
        }

        clearPendingConnector();
        previewPointRef.current = null;
        setPreviewPoint(null);
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [blockId, startPendingConnector, clearPendingConnector, addConnector, setSelectedConnectorId, setSelection]
  );

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return {
    onHandlePointerDown: startConnectorDrag,
    startConnectorDrag,
    previewPoint,
    pendingConnectorFrom,
  };
}
