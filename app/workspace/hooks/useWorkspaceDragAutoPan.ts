"use client";

import { useCallback, useMemo, useRef } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

/** Matches legacy Mindmap's edge-pan feel (connectorDragViewport.ts's
 *  edgePanDelta / EDGE_THRESHOLD / MAX_PAN_PER_FRAME) — not shared code
 *  (different camera shape), same constants and falloff curve. */
const EDGE_THRESHOLD = 48;
const MAX_PAN_PER_FRAME = 18;

export function edgePanDelta(position: number, size: number): number {
  if (size <= 0) return 0;
  if (position < EDGE_THRESHOLD) {
    return MAX_PAN_PER_FRAME * (1 - Math.max(0, position) / EDGE_THRESHOLD);
  }
  if (position > size - EDGE_THRESHOLD) {
    return -MAX_PAN_PER_FRAME * (1 - Math.max(0, size - position) / EDGE_THRESHOLD);
  }
  return 0;
}

/** Keeps the viewport panning while a drag (block, connector, waypoint...)
 *  holds the pointer near the edge of the canvas — legacy has this for both
 *  node dragging and connector dragging (useCanvasEvents.dragMove.ts /
 *  useConnectorDragAutoPan.ts); this engine had neither, so dragging
 *  anything toward off-screen content was simply stuck at the edge.
 *
 *  Deliberately simple: only nudges `camera.x/y` each frame. It does not
 *  re-run the caller's own drag-move math to keep the dragged item glued to
 *  the cursor while the pointer itself stays still — during a real drag the
 *  user keeps moving the mouse toward the target, which fires fresh
 *  pointermove events that the caller's own handler already re-positions
 *  from, so this only needs to keep the world moving under a held pointer,
 *  not own the dragged item's position. */
export function useWorkspaceDragAutoPan(onPan?: (dx: number, dy: number) => void) {
  const activeRef = useRef(false);
  const pointerRef = useRef({ clientX: 0, clientY: 0 });
  const rafRef = useRef<number | null>(null);
  const onPanRef = useRef(onPan);
  onPanRef.current = onPan;

  const stop = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    rafRef.current = null;
    if (!activeRef.current) return;
    const canvas = document.querySelector('[data-workspace-canvas="true"]');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { clientX, clientY } = pointerRef.current;
    const dx = edgePanDelta(clientX - rect.left, rect.width);
    const dy = edgePanDelta(clientY - rect.top, rect.height);
    if (dx !== 0 || dy !== 0) {
      const camera = useWorkspaceStore.getState().camera;
      useWorkspaceStore.getState().setCamera({ x: camera.x + dx, y: camera.y + dy });
      // Matches legacy's autoPanTick (useCanvasEvents.dragMove.ts): panning
      // the camera without also shifting the drag's own reference point
      // desyncs screen-delta-based drag math from the world underneath a
      // held, unmoving pointer. The caller re-applies its drag-start offset
      // and immediately recomputes the dragged item's position from it.
      onPanRef.current?.(dx, dy);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  /** Call on every pointermove while the drag is active. */
  const reportPointer = useCallback((clientX: number, clientY: number) => {
    pointerRef.current = { clientX, clientY };
    activeRef.current = true;
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // reportPointer/stop are each stably memoized (empty or stable deps), but
  // the plain object literal returned here was a fresh reference every
  // render regardless. A caller that puts this whole hook's return value in
  // a useEffect dependency array (as useBlockDrag.ts's unmount-cleanup
  // effect does, to always call the latest `stop`) would then re-run that
  // effect's cleanup after every render during a drag — wiping any other
  // per-drag ref state the cleanup also tears down. Memoizing here keeps the
  // returned object itself stable across renders too.
  return useMemo(() => ({ reportPointer, stop }), [reportPointer, stop]);
}

export default useWorkspaceDragAutoPan;
