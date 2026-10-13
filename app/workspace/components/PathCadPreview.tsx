"use client";

import React from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useWorkspacePathCadStore } from "../store/useWorkspacePathCadStore";
import { resolveTransform } from "../types/block";
import { previewPathPoints, previewPathTransform } from "../utils/pathCad";

const DEFAULT_TRANSFORM = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

export function PathCadPreview() {
  const command = useWorkspacePathCadStore((state) => state.command);
  const base = useWorkspacePathCadStore((state) => state.basePoint);
  const current = useWorkspacePathCadStore((state) => state.currentPoint);
  const id = useWorkspaceStore((state) => state.selectedBlockIds.length === 1 ? state.selectedBlockIds[0] : null);
  const block = useWorkspaceStore((state) => id ? state.blocks[id] : null);

  if (!command || !base || !current || !block || block.type !== "path") return null;
  const pathBlock = block as import("../types/block").CanvasBlock<"path">;
  const transform = resolveTransform(pathBlock.transform, DEFAULT_TRANSFORM);
  const previewTransform = previewPathTransform(transform, command, base, current, useWorkspacePathCadStore.getState().initialMousePoint);
  const points = previewPathPoints(pathBlock, command);
  const pointsString = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div
      data-path-cad-preview="true"
      aria-label={`${command} preview`}
      style={{
        position: "absolute",
        left: previewTransform.x,
        top: previewTransform.y,
        width: previewTransform.w,
        height: previewTransform.h,
        zIndex: previewTransform.zIndex + 1,
        transform: previewTransform.rotation ? `rotate(${previewTransform.rotation}deg)` : undefined,
        opacity: 0.45,
        pointerEvents: "none",
      }}
    >
      <svg width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <polyline points={pointsString} stroke={pathBlock.data.strokeColor ?? "#2563eb"} strokeWidth={pathBlock.data.strokeWidth ?? 2} fill="none" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default PathCadPreview;
