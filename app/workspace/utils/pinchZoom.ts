import type { CameraState } from "../types/camera";

export interface PinchPoint {
  x: number;
  y: number;
}

export function pinchDistance(first: PinchPoint, second: PinchPoint) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function applyPinchZoom(
  camera: Pick<CameraState, "x" | "y" | "zoom">,
  previousDistance: number,
  nextDistance: number,
  center: PinchPoint,
  minZoom: number,
  maxZoom: number,
) {
  if (!Number.isFinite(previousDistance) || previousDistance <= 0 || !Number.isFinite(nextDistance) || nextDistance <= 0) {
    return camera;
  }

  const nextZoom = Math.min(maxZoom, Math.max(minZoom, camera.zoom * (nextDistance / previousDistance)));
  if (nextZoom === camera.zoom) return camera;

  const scale = nextZoom / camera.zoom;
  return {
    x: center.x - (center.x - camera.x) * scale,
    y: center.y - (center.y - camera.y) * scale,
    zoom: nextZoom,
  };
}
