import type { CSSProperties } from "react";
import type { CanvasBlock, Transform } from "../types/block";

interface BlockFrameStyleArgs {
  block: CanvasBlock;
  transform: Transform;
  visualTransform?: string;
  isHistoryOpen: boolean;
  isQuickAddHandoff: boolean;
  isConnectorEndpoint: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isLocked: boolean;
  isCommentMode: boolean;
  activeConnectorTool: unknown;
  connectorFocusActive: boolean;
  isPulsing: boolean;
}

export function getBlockFrameStyle({
  block, transform, visualTransform, isHistoryOpen, isQuickAddHandoff,
  isConnectorEndpoint, isSelected, isHovered, isLocked, isCommentMode,
  activeConnectorTool, connectorFocusActive, isPulsing,
}: BlockFrameStyleArgs): CSSProperties {
  return {
          position: "absolute",
          pointerEvents: block.type === "table" && (block as CanvasBlock<"table">).data?.passThroughEmptyCellClicks ? "none" : "auto",
          left: `${transform.x}px`,
          top: `${transform.y}px`,
          width: `${transform.w}px`,
          height: `${transform.h}px`,
          zIndex: isHistoryOpen ? 2000 : isQuickAddHandoff ? 1100 : isConnectorEndpoint ? 1200 : (isSelected || isHovered) && block.type !== "table" ? 1000 : transform.zIndex,
          transform: visualTransform,
          touchAction: "none",
          userSelect: "none",
          cursor: isLocked ? "default" : isCommentMode ? "pointer" : activeConnectorTool ? "crosshair" : undefined,
          opacity: connectorFocusActive && !isConnectorEndpoint ? 0.42 : 1,
          boxShadow: isConnectorEndpoint
            ? "0 0 0 3px rgba(37, 99, 235, 0.46), 0 8px 20px rgba(37, 99, 235, 0.18)"
            : isPulsing ? "0 0 0 3px rgba(37, 99, 235, 0.35)" : undefined,
          transition: "opacity 160ms ease, box-shadow 180ms ease-out",

  };
}
