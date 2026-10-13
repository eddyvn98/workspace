"use client";

import { useEffect, useRef } from "react";

interface WorkspaceInitialFitCamera {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Match legacy's first-content fit for a newly-created board. A saved board
 * keeps its camera exactly where the user left it; only a self-created board
 * still at the default camera is eligible for this one-shot fit.
 */
export function useWorkspaceInitialFit(
  boardId: string | null,
  isLoadingBoard: boolean,
  loadError: boolean,
  blockCount: number,
  hasSavedCamera: boolean,
  camera: WorkspaceInitialFitCamera,
  handleFitView: () => void,
): void {
  const fittedBoardRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !boardId
      || isLoadingBoard
      || loadError
      || blockCount === 0
      || fittedBoardRef.current === boardId
      || hasSavedCamera
      || camera.x !== 0
      || camera.y !== 0
      || camera.zoom !== 1
    ) return;

    const timer = window.setTimeout(() => {
      fittedBoardRef.current = boardId;
      handleFitView();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [boardId, blockCount, camera.x, camera.y, camera.zoom, handleFitView, hasSavedCamera, isLoadingBoard, loadError]);
}
