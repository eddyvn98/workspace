import { useCallback, useEffect, useRef } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { screenToCanvas } from "../utils/geometry";
import { applyPinchZoom, pinchDistance } from "../utils/pinchZoom";
import { WORKSPACE_MAX_ZOOM, WORKSPACE_MIN_ZOOM } from "../utils/viewportConstants";
import { workspacePerfLog } from "../utils/workspacePerfDebug";

const ZOOM_SENSITIVITY = 0.0022;
const WHEEL_DELTA_CLAMP = 320;
const TOUCH_MIN_ZOOM = 0.2;

export function cameraPanPatch(
  startCamera: { x: number; y: number },
  startPointer: { x: number; y: number },
  currentPointer: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: startCamera.x + currentPointer.x - startPointer.x,
    y: startCamera.y + currentPointer.y - startPointer.y,
  };
}

export function useCameraControls() {
  const camera = useWorkspaceStore((state) => state.camera);
  const setCamera = useWorkspaceStore((state) => state.setCamera);
  const canvasRef = useRef<HTMLDivElement>(null);

  const isPanningRef = useRef(false);
  const startPointerRef = useRef({ x: 0, y: 0 });
  const startCameraRef = useRef({ x: 0, y: 0 });
  const currentPointerRef = useRef({ x: 0, y: 0 });
  const rafIdRef = useRef<number | null>(null);
  const wheelRafRef = useRef<number | null>(null);
  const pendingWheelRef = useRef({ x: 0, y: 0, deltaY: 0, hasPending: false });
  const pinchDistanceRef = useRef(0);
  const pendingPinchRef = useRef<{ distance: number; x: number; y: number } | null>(null);
  const pinchRafRef = useRef<number | null>(null);
  const wheelEventCountRef = useRef(0);

  const flushPinch = useCallback(() => {
    pinchRafRef.current = null;
    const pending = pendingPinchRef.current;
    if (!pending || pinchDistanceRef.current <= 0) return;
    pendingPinchRef.current = null;

    const currentCamera = useWorkspaceStore.getState().camera;
    const nextCamera = applyPinchZoom(
      currentCamera,
      pinchDistanceRef.current,
      pending.distance,
      { x: pending.x, y: pending.y },
      TOUCH_MIN_ZOOM,
      WORKSPACE_MAX_ZOOM,
    );
    pinchDistanceRef.current = pending.distance;
    if (nextCamera !== currentCamera) setCamera(nextCamera);
  }, [setCamera]);

  const onTouchStart = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2) return;
    const first = e.touches[0];
    const second = e.touches[1];
    pinchDistanceRef.current = pinchDistance(
      { x: first.clientX, y: first.clientY },
      { x: second.clientX, y: second.clientY },
    );
    pendingPinchRef.current = null;
    e.preventDefault();
  }, []);

  const onTouchMove = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || pinchDistanceRef.current <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const first = e.touches[0];
    const second = e.touches[1];
    pendingPinchRef.current = {
      distance: pinchDistance(
        { x: first.clientX, y: first.clientY },
        { x: second.clientX, y: second.clientY },
      ),
      x: (first.clientX + second.clientX) / 2 - rect.left,
      y: (first.clientY + second.clientY) / 2 - rect.top,
    };
    if (pinchRafRef.current === null) pinchRafRef.current = requestAnimationFrame(flushPinch);
    e.preventDefault();
  }, [flushPinch]);

  const onTouchEnd = useCallback((e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length >= 2) return;
    if (pinchRafRef.current !== null) {
      cancelAnimationFrame(pinchRafRef.current);
      pinchRafRef.current = null;
      flushPinch();
    }
    pinchDistanceRef.current = 0;
    pendingPinchRef.current = null;
  }, [flushPinch]);

  const flushWheel = useCallback(() => {
    wheelRafRef.current = null;
    const pending = pendingWheelRef.current;
    if (!pending.hasPending) return;
    pendingWheelRef.current = { ...pending, deltaY: 0, hasPending: false };

    const currentCam = useWorkspaceStore.getState().camera;
    const deltaY = Math.max(-WHEEL_DELTA_CLAMP, Math.min(WHEEL_DELTA_CLAMP, pending.deltaY));
    const newZoom = Math.min(WORKSPACE_MAX_ZOOM, Math.max(WORKSPACE_MIN_ZOOM, currentCam.zoom * Math.exp(-deltaY * ZOOM_SENSITIVITY)));
    if (newZoom === currentCam.zoom) return;

    const canvasPoint = screenToCanvas({ x: pending.x, y: pending.y }, currentCam);
    workspacePerfLog("wheel-flush", {
      coalescedEvents: wheelEventCountRef.current,
      deltaY,
      zoomBefore: currentCam.zoom,
      zoomAfter: newZoom,
    });
    wheelEventCountRef.current = 0;
    setCamera({
      x: pending.x - canvasPoint.x * newZoom,
      y: pending.y - canvasPoint.y * newZoom,
      zoom: newZoom,
    });
  }, [setCamera]);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-workspace-wheel-lock='true'], [data-mindmap-wheel-lock='true']")) return;
      e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      pendingWheelRef.current = {
        x: cursorX,
        y: cursorY,
        deltaY: pendingWheelRef.current.deltaY + e.deltaY,
        hasPending: true,
      };
      wheelEventCountRef.current += 1;
      if (wheelRafRef.current === null) wheelRafRef.current = requestAnimationFrame(flushWheel);
    },
    [flushWheel]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const dragMode = useWorkspaceStore.getState().dragMode;
      const canPan = e.button === 1 || (dragMode === "pan" && e.button === 0 && !e.ctrlKey && !e.metaKey);
      if (!canPan) return;
      if (e.defaultPrevented) return;

      isPanningRef.current = true;
      startPointerRef.current = { x: e.clientX, y: e.clientY };
      const currentCam = useWorkspaceStore.getState().camera;
      startCameraRef.current = { x: currentCam.x, y: currentCam.y };
      currentPointerRef.current = { x: e.clientX, y: e.clientY };

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture may fail in certain environments (e.g. tests)
      }
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isPanningRef.current) return;

      currentPointerRef.current = { x: e.clientX, y: e.clientY };

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (!isPanningRef.current) return;

          setCamera(cameraPanPatch(startCameraRef.current, startPointerRef.current, currentPointerRef.current));
        });
      }
    },
    [setCamera]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isPanningRef.current) return;

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      setCamera(cameraPanPatch(startCameraRef.current, startPointerRef.current, { x: e.clientX, y: e.clientY }));

      isPanningRef.current = false;

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Pointer capture may fail in certain environments (e.g. tests)
      }
    },
    [setCamera]
  );

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (wheelRafRef.current !== null) cancelAnimationFrame(wheelRafRef.current);
      if (pinchRafRef.current !== null) cancelAnimationFrame(pinchRafRef.current);
    };
  }, []);

  return {
    camera,
    canvasRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
