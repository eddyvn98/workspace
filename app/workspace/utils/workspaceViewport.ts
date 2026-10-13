import type { CameraState } from "../types/camera";
import type { Transform } from "../types/block";

export interface WorkspaceViewportSize {
  width: number;
  height: number;
}

export interface WorkspaceViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Keep `Zoom all` numerically aligned with the legacy viewport. The old
 * engine reserves 96px on every side and caps an automatic fit at 150%; the
 * manual zoom controls have a wider range, so this is intentionally separate
 * from WORKSPACE_MAX_ZOOM.
 */
export function fitWorkspaceCamera(
  bounds: WorkspaceViewportBounds,
  viewport: WorkspaceViewportSize,
  minZoom = 0.02,
  maxZoom = 1.5,
  padding = 96,
): Pick<CameraState, "x" | "y" | "zoom"> {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const centerX = bounds.minX + width / 2;
  const centerY = bounds.minY + height / 2;
  const scale = Math.min(
    (viewport.width - padding * 2) / width,
    (viewport.height - padding * 2) / height,
  );
  const zoom = Math.min(maxZoom, Math.max(minZoom, scale));
  return {
    x: viewport.width / 2 - centerX * zoom,
    y: viewport.height / 2 - centerY * zoom,
    zoom,
  };
}

/** Keep a newly-created blank map visible like the legacy map's initial fit. */
export function centeredWorkspaceCamera(
  transform: Pick<Transform, "x" | "y" | "w" | "h">,
  viewport: WorkspaceViewportSize,
  zoom = 1.5,
  topInset = 28,
): Pick<CameraState, "x" | "y" | "zoom"> {
  return {
    x: viewport.width / 2 - (transform.x + transform.w / 2) * zoom,
    y: topInset + viewport.height / 2 - (transform.y + transform.h / 2) * zoom,
    zoom,
  };
}
