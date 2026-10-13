import type { CanvasBlock } from "../types/block";
import type { CameraFrame } from "../types/camera";
import { collectDragBlockIds } from "../hooks/blockDragTypes";
import { blockWorldAabb } from "./blockRects";
import { fitWorkspaceCamera } from "./workspaceViewport";
import { getWorkspaceViewportSize } from "../hooks/useWorkspaceViewportControls";
import { createWorkspaceId } from "./workspaceId";

/** Union bounding box (world/canvas space) of every given block, or null if
 *  none resolve — mirrors selectionScreenBounds' all-or-nothing behaviour but
 *  in world coordinates, since fitWorkspaceCamera needs bounds in the same
 *  space as camera.x/y, not screen pixels. */
function unionWorldBounds(blocks: Record<string, CanvasBlock>, blockIds: string[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const expanded = new Set(blockIds.flatMap((id) => collectDragBlockIds(blocks, id, [id])));
  for (const id of expanded) {
    const rect = blockWorldAabb(blocks, id);
    if (!rect) continue;
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

/** Builds a new CameraFrame fit to the given blocks (any type — a frame is
 *  just a saved camera position, so it works for a table, a doc, a shape, a
 *  whole cluster of selected blocks, anything). Falls back to the current
 *  camera when no block resolves (e.g. an empty selection). */
export function createFrameForBlocks(
  blocks: Record<string, CanvasBlock>,
  blockIds: string[],
  fallbackCamera: { x: number; y: number; zoom: number },
  order: number,
  name: string,
): CameraFrame {
  const bounds = unionWorldBounds(blocks, blockIds);
  const camera = bounds
    ? fitWorkspaceCamera(
        { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY },
        getWorkspaceViewportSize(),
      )
    : fallbackCamera;
  return { id: createWorkspaceId(), name, camera, order, ...(bounds ? { blockIds: blockIds.filter((id) => !!blocks[id]) } : {}) };
}

export function resolveCameraFrame(frame: CameraFrame, blocks: Record<string, CanvasBlock>): CameraFrame["camera"] {
  const bounds = unionWorldBounds(blocks, frame.blockIds ?? []);
  return bounds ? fitWorkspaceCamera(bounds, getWorkspaceViewportSize()) : frame.camera;
}

export function duplicateCameraFrame(frames: CameraFrame[], id: string): CameraFrame[] {
  const ordered = sortedFrames(frames);
  const index = ordered.findIndex((frame) => frame.id === id);
  if (index < 0) return ordered;
  const source = ordered[index];
  ordered.splice(index + 1, 0, { ...source, id: createWorkspaceId(), name: `${source.name} copy`, camera: { ...source.camera }, blockIds: source.blockIds ? [...source.blockIds] : undefined });
  return ordered.map((frame, order) => ({ ...frame, order }));
}

/** Frames in play order, lowest `order` first. */
export function normalizeCameraFrames(value: unknown): CameraFrame[] {
  return Array.isArray(value) ? value as CameraFrame[] : [];
}

export function sortedFrames(frames: CameraFrame[] | null | undefined): CameraFrame[] {
  return [...normalizeCameraFrames(frames)].sort((a, b) => a.order - b.order);
}

/** Moves the frame at fromIndex (within play order) to toIndex and
 *  renumbers every frame's `order` to its new index — keeps `order` dense
 *  and contiguous so a later single insert/delete never has to guess a gap. */
export function reorderFrames(frames: CameraFrame[], fromIndex: number, toIndex: number): CameraFrame[] {
  const ordered = sortedFrames(frames);
  if (fromIndex < 0 || fromIndex >= ordered.length || toIndex < 0 || toIndex >= ordered.length) return ordered;
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(toIndex, 0, moved);
  return ordered.map((frame, index) => ({ ...frame, order: index }));
}
