"use client";

import { useEffect, useRef } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { WORKSPACE_MAX_ZOOM, WORKSPACE_MIN_ZOOM } from "../utils/viewportConstants";

const COMMENTS_PANEL_WIDTH = 300;

/**
 * Keeps the same content visible (just smaller) when the AI chat or comments
 * side panel opens/closes, instead of letting the panel simply crop the
 * canvas viewport — the "video shrinks to fit its frame" behavior the user
 * asked for. Scales camera.x/y/zoom together by the ratio of the visible
 * canvas width before/after the reserved (panel) width changes, which is
 * equivalent to a pure visual scale anchored at the top-left corner but goes
 * through the real zoom state so every pointer/drag/draw calculation
 * (screenToCanvas etc.) stays correct at the new zoom level.
 *
 * Deliberately keyed off chatPanelWidth/isCommentMode only — NOT a raw
 * ResizeObserver on the canvas element — so a plain browser window resize
 * (unrelated to panel visibility) does not also trigger a rescale.
 */
export function useWorkspaceCanvasAutoFit() {
  const chatPanelWidth = useWorkspaceStore((state) => state.chatPanelWidth);
  const isCommentMode = useWorkspaceStore((state) => state.isCommentMode);
  const camera = useWorkspaceStore((state) => state.camera);
  const setCamera = useWorkspaceStore((state) => state.setCamera);

  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const prevReservedRef = useRef<number | null>(null);

  useEffect(() => {
    const reserved = chatPanelWidth + (isCommentMode ? COMMENTS_PANEL_WIDTH : 0);
    const prevReserved = prevReservedRef.current;
    prevReservedRef.current = reserved;

    // First run, or nothing actually changed: just record the baseline.
    if (prevReserved === null || prevReserved === reserved) return;

    const root = document.querySelector<HTMLElement>("[data-workspace-root]");
    const fullWidth = root?.clientWidth;
    if (!fullWidth) return;

    const oldVisible = fullWidth - prevReserved;
    const newVisible = fullWidth - reserved;
    if (oldVisible <= 0 || newVisible <= 0) return;

    const ratio = newVisible / oldVisible;
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio === 1) return;

    const current = cameraRef.current;
    const nextZoom = Math.min(WORKSPACE_MAX_ZOOM, Math.max(WORKSPACE_MIN_ZOOM, current.zoom * ratio));
    // Re-derive the ratio actually applied so x/y stay consistent with the
    // clamped zoom (avoids the camera drifting once zoom hits a clamp).
    const appliedRatio = nextZoom / current.zoom;
    setCamera({
      x: current.x * appliedRatio,
      y: current.y * appliedRatio,
      zoom: nextZoom,
    });
  }, [chatPanelWidth, isCommentMode, setCamera]);
}
