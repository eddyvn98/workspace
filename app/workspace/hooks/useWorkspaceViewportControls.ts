"use client";

import { useCallback } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { resolveTransform, type CanvasBlock, type Transform } from "../types/block";
import { WORKSPACE_MAX_ZOOM, WORKSPACE_MIN_ZOOM } from "../utils/viewportConstants";
import { fitWorkspaceCamera } from "../utils/workspaceViewport";

const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  w: 160,
  h: 80,
  rotation: 0,
  zIndex: 0,
};

export function getWorkspaceViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 1024, height: 768 };
  const canvas = document.querySelector<HTMLElement>("[data-workspace-canvas]");
  return {
    width: canvas?.clientWidth || window.innerWidth,
    height: canvas?.clientHeight || window.innerHeight,
  };
}

export function useWorkspaceViewportControls() {
  const blocks = useWorkspaceStore((state) => state.blocks);
  const camera = useWorkspaceStore((state) => state.camera);
  const setCamera = useWorkspaceStore((state) => state.setCamera);
  const dragMode = useWorkspaceStore((state) => state.dragMode);
  const setDragMode = useWorkspaceStore((state) => state.setDragMode);

  const zoomAtCenter = useCallback(
    (factor: number) => {
      const { width: viewportWidth, height: viewportHeight } = getWorkspaceViewportSize();
      const nextZoom = Math.min(Math.max(camera.zoom * factor, WORKSPACE_MIN_ZOOM), WORKSPACE_MAX_ZOOM);
      if (nextZoom === camera.zoom) return;
      const canvasCenterX = (viewportWidth / 2 - camera.x) / camera.zoom;
      const canvasCenterY = (viewportHeight / 2 - camera.y) / camera.zoom;
      setCamera({
        x: viewportWidth / 2 - canvasCenterX * nextZoom,
        y: viewportHeight / 2 - canvasCenterY * nextZoom,
        zoom: nextZoom,
      });
    },
    [camera, setCamera]
  );

  const fitToBlocks = useCallback(
    (blockList: CanvasBlock[]) => {
      if (blockList.length === 0) {
        setCamera({ x: 0, y: 0, zoom: 1 });
        return;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const block of blockList) {
        const transform = resolveTransform(block.transform, DEFAULT_TRANSFORM);
        minX = Math.min(minX, transform.x);
        minY = Math.min(minY, transform.y);
        maxX = Math.max(maxX, transform.x + transform.w);
        maxY = Math.max(maxY, transform.y + transform.h);
      }

      setCamera(fitWorkspaceCamera(
        { minX, minY, maxX, maxY },
        getWorkspaceViewportSize(),
        WORKSPACE_MIN_ZOOM,
        1.5,
      ));
    },
    [setCamera]
  );

  const handleFitView = useCallback(() => {
    fitToBlocks(Object.values(blocks));
  }, [blocks, fitToBlocks]);

  const centerOnBlock = useCallback((blockId: string) => {
    const block = blocks[blockId];
    if (!block) return;
    const transform = resolveTransform(block.transform, DEFAULT_TRANSFORM);
    const { width: viewportWidth, height: viewportHeight } = getWorkspaceViewportSize();
    setCamera({
      x: viewportWidth / 2 - (transform.x + transform.w / 2) * camera.zoom,
      y: viewportHeight / 2 - (transform.y + transform.h / 2) * camera.zoom,
    });
  }, [blocks, camera.zoom, setCamera]);

  const toggleDragMode = useCallback(() => {
    setDragMode(dragMode === "pan" ? "select" : "pan");
  }, [dragMode, setDragMode]);

  return {
    camera,
    zoom: camera.zoom,
    dragMode,
    setDragMode,
    toggleDragMode,
    zoomAtCenter,
    fitToBlocks,
    handleFitView,
    centerOnBlock,
  };
}
