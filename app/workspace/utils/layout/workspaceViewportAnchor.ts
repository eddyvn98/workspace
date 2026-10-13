import { resolveTransform, type BlockId, type CanvasBlock } from "../../types/block";
import type { CameraState } from "../../types/camera";

export interface WorkspaceViewportAnchor {
  blockId: BlockId;
  screenX: number;
  screenY: number;
}

export const WORKSPACE_TOP_BAR_CLEARANCE = 112;

const FALLBACK_TRANSFORM = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

function resolved(block: CanvasBlock) {
  return resolveTransform(block.transform, FALLBACK_TRANSFORM);
}

/** Preserve the selected node's screen position across a layout reflow. */
export function captureWorkspaceViewportAnchor(
  blocks: Record<BlockId, CanvasBlock>,
  selectedBlockIds: BlockId[],
  rootId: BlockId,
  camera: CameraState,
): WorkspaceViewportAnchor | null {
  const blockId = selectedBlockIds.find((id) => blocks[id]) ?? rootId;
  const block = blocks[blockId];
  if (!block) return null;
  const transform = resolved(block);
  return {
    blockId,
    screenX: camera.x + (transform.x + transform.w / 2) * camera.zoom,
    screenY: camera.y + transform.y * camera.zoom,
  };
}

export function restoreWorkspaceViewportAnchor(
  anchor: WorkspaceViewportAnchor,
  blocks: Record<BlockId, CanvasBlock>,
  rootId: BlockId,
  camera: CameraState,
): Pick<CameraState, "x" | "y"> | null {
  const block = blocks[anchor.blockId] ?? blocks[rootId];
  if (!block) return null;
  const transform = resolved(block);
  return {
    x: anchor.screenX - (transform.x + transform.w / 2) * camera.zoom,
    y: anchor.screenY - transform.y * camera.zoom,
  };
}

/** Keep every visible auto-laid-out block below the canvas chrome. */
export function clampWorkspaceViewportTop(
  blocks: Record<BlockId, CanvasBlock>,
  rootId: BlockId,
  camera: CameraState,
  minimumScreenY = WORKSPACE_TOP_BAR_CLEARANCE,
): Pick<CameraState, "y"> | null {
  const children = new Map<BlockId, BlockId[]>();
  Object.values(blocks).forEach((block) => {
    if (!block.parentId) return;
    children.set(block.parentId, [...(children.get(block.parentId) ?? []), block.id]);
  });
  const visible = new Set<BlockId>();
  const visit = (id: BlockId) => {
    if (visible.has(id) || !blocks[id]) return;
    visible.add(id);
    if (blocks[id].isCollapsed) return;
    children.get(id)?.forEach(visit);
  };
  visit(rootId);
  const minTop = [...visible].reduce((min, id) => {
    const transform = resolved(blocks[id]);
    return Math.min(min, camera.y + transform.y * camera.zoom);
  }, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(minTop) || minTop >= minimumScreenY) return null;
  return { y: camera.y + minimumScreenY - minTop };
}
