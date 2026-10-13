"use client";

/**
 * app/workspace/utils/workspaceCameraFocus.ts
 *
 * "Jump the camera to this block" — the same centering math
 * WorkspaceOutlinePanel.tsx already uses when you click an outline row,
 * reused here for the chat panel's Focus feature. Legacy Mindmap's chat
 * panel has always centered the camera on the block(s) an AI action just
 * touched (`centerOnNode` in usePageMapActions.ts) and selected them so the
 * user can see what changed without hunting for it — workspace's chat panel
 * never got that when it was ported, on either the Dify path or the
 * DeepSeek agent-mode test path.
 */
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { resolveTransform } from "../types/block";
import { getWorkspaceViewportSize } from "../hooks/useWorkspaceViewportControls";

const DEFAULT_TRANSFORM = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

/** Pans (never zooms) so the given block's center lands at the viewport
 *  center, at whatever zoom is already active. Returns false when the block
 *  no longer exists (e.g. deleted since the message was sent). */
export function centerWorkspaceCameraOnBlock(blockId: string): boolean {
  if (typeof window === "undefined") return false;
  const state = useWorkspaceStore.getState();
  const target = state.blocks[blockId];
  if (!target) return false;

  const tf = resolveTransform(target.transform, DEFAULT_TRANSFORM);
  const { width: vw, height: vh } = getWorkspaceViewportSize();
  const blockCenterX = tf.x + tf.w / 2;
  const blockCenterY = tf.y + tf.h / 2;
  state.setCamera({
    x: vw / 2 - blockCenterX * state.camera.zoom,
    y: vh / 2 - blockCenterY * state.camera.zoom,
  });
  return true;
}

/** Selects every given block (the selection border IS the highlight — no
 *  separate glow/animation system to build) and centers the camera on the
 *  first one that still exists. */
export function focusWorkspaceBlocks(blockIds: string[]): void {
  const survivingIds = blockIds.filter((id) => Boolean(useWorkspaceStore.getState().blocks[id]));
  if (survivingIds.length === 0) return;
  useWorkspaceStore.getState().setSelection(survivingIds);
  centerWorkspaceCameraOnBlock(survivingIds[0]);
}
