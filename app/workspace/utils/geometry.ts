import type { Position } from "../types/block";
import type { CameraState } from "../types/camera";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function screenToCanvas(
  point: Position,
  camera: Pick<CameraState, "x" | "y" | "zoom">
): Position {
  const zoom = camera.zoom === 0 ? 1 : camera.zoom;
  return {
    x: (point.x - camera.x) / zoom,
    y: (point.y - camera.y) / zoom,
  };
}

export function clientToCanvasScreen(
  point: Position,
  canvasRect: Pick<DOMRect, "left" | "top">,
): Position {
  return { x: point.x - canvasRect.left, y: point.y - canvasRect.top };
}

export function canvasToScreen(
  point: Position,
  camera: Pick<CameraState, "x" | "y" | "zoom">
): Position {
  return {
    x: point.x * camera.zoom + camera.x,
    y: point.y * camera.zoom + camera.y,
  };
}

export function rectCenter(rect: Rect): Position {
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
  };
}
