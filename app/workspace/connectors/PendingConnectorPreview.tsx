import React from "react";
import type { AnchorSide } from "../types/connector";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { pickFacingSide, pointOnRectSide } from "./anchorRegistry";
import { blockWorldRect } from "./blockWorldRect";
import { buildConnectorPathParity } from "./connectorPathParity";
import { computeConnectorGeometry } from "./connectorGeometry";
import { resolveConnectorCreationLineType } from "./connectorCreationStyle";
import { IDENTITY_CAMERA, resolveConnectorDropTarget, resolveExplicitConnectorDropTarget, screenUnits } from "./connectorPointer";

export function PendingConnectorPreview({ fromBlockId, fromSide: pinnedSide, sourceRect, point, clientPoint }: {
  fromBlockId: string;
  fromSide?: AnchorSide | null;
  sourceRect: DOMRect;
  point: { x: number; y: number };
  clientPoint: { x: number; y: number };
}) {
  const blocks = useWorkspaceStore((state) => state.blocks);
  const zoom = useWorkspaceStore((state) => state.camera.zoom);
  const activeTool = useWorkspaceStore((state) => state.activeConnectorTool);
  const fromSide = pinnedSide ?? pickFacingSide(sourceRect, new DOMRect(point.x, point.y, 0, 0));
  const start = pointOnRectSide(sourceRect, fromSide);
  const target = resolveExplicitConnectorDropTarget(blocks, fromBlockId, clientPoint)
    ?? resolveConnectorDropTarget(blocks, fromBlockId, point);
  const lineType = activeTool?.lineType ?? resolveConnectorCreationLineType(useWorkspaceStore.getState(), fromBlockId);
  const targetRect = target ? blockWorldRect(blocks, target.blockId) : null;
  const geometry = target && targetRect ? computeConnectorGeometry({
    id: "pending", fromBlockId, fromSide, toBlockId: target.blockId, toSide: target.side, lineType,
  }, sourceRect, targetRect, blocks, IDENTITY_CAMERA, 0, 0) : null;
  const d = geometry?.pathD ?? buildConnectorPathParity(start, target?.point ?? point, lineType);
  return <path data-connector-preview="true" d={d} fill="none" stroke="#2563eb" strokeWidth={screenUnits(2, zoom)} strokeDasharray={`${screenUnits(4, zoom)},${screenUnits(4, zoom)}`} />;
}
