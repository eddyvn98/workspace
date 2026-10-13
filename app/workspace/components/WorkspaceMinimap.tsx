"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useHiddenBlocks } from "../hooks/useHiddenBlocks";
import { resolveTransform, type Transform } from "../types/block";
import { WorkspaceMinimapCanvas, type WorkspaceMinimapNode, type WorkspaceMinimapPath } from "../utils/workspaceMinimap";

const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  w: 160,
  h: 80,
  rotation: 0,
  zIndex: 0,
};

export interface WorkspaceMinimapProps {
  onClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function WorkspaceMinimap({ onClose, onMouseEnter, onMouseLeave }: WorkspaceMinimapProps) {
  const hiddenBlocks = useHiddenBlocks();
  const blocks = useWorkspaceStore((state) => state.blocks);
  const connectors = useWorkspaceStore((state) => state.connectors);
  const camera = useWorkspaceStore((state) => state.camera);
  const setCamera = useWorkspaceStore((state) => state.setCamera);
  const [windowSize, setWindowSize] = useState({
    width: typeof window === "undefined" ? 1024 : window.innerWidth,
    height: typeof window === "undefined" ? 768 : window.innerHeight,
  });
  const panRef = useRef({ x: camera.x, y: camera.y });
  const zoomRef = useRef(camera.zoom || 1);

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    panRef.current = { x: camera.x, y: camera.y };
    zoomRef.current = camera.zoom || 1;
  }, [camera.x, camera.y, camera.zoom]);

  const nodes = useMemo<WorkspaceMinimapNode[]>(
    () => Object.values(blocks).flatMap((block, index) => {
      if (hiddenBlocks.has(block.id)) return [];
      const transform = resolveTransform(block.transform, DEFAULT_TRANSFORM);
      return [{
        id: block.id,
        x: transform.x,
        y: transform.y,
        width: transform.w,
        height: transform.h,
        level: 0,
        branchColor: block.style?.borderColor ?? ["#3b82f6", "#22c55e", "#f97316"][index % 3],
      }];
    }),
    [blocks, hiddenBlocks]
  );

  const paths = useMemo<WorkspaceMinimapPath[]>(() => Object.values(connectors).flatMap((connector) => {
    if (hiddenBlocks.has(connector.fromBlockId) || hiddenBlocks.has(connector.toBlockId)) return [];
    const from = blocks[connector.fromBlockId];
    const to = blocks[connector.toBlockId];
    if (!from || !to) return [];
    const start = resolveTransform(from.transform, DEFAULT_TRANSFORM);
    const end = resolveTransform(to.transform, DEFAULT_TRANSFORM);
    const points = [
      { x: start.x + start.w / 2, y: start.y + start.h / 2 },
      ...(connector.waypoints ?? []),
      { x: end.x + end.w / 2, y: end.y + end.h / 2 },
    ];
    return [{
      id: connector.id,
      d: points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "),
      color: connector.strokeColor ?? "#94a3b8",
    }];
  }), [blocks, connectors, hiddenBlocks]);

  const handleNavigate = useCallback((nextPan: { x: number; y: number }) => {
    panRef.current = nextPan;
    setCamera(nextPan);
  }, [setCamera]);

  return (
    <WorkspaceMinimapCanvas
      nodes={nodes}
      paths={paths}
      currentPan={panRef}
      currentZoom={zoomRef}
      containerWidth={windowSize.width}
      containerHeight={windowSize.height}
      onNavigate={handleNavigate}
      onClose={() => onClose?.()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}

export default WorkspaceMinimap;
