import { requestSlidePresentation } from "./slidePresentationRequest";
import { startWorkspacePresenting, setWorkspacePresentIndex } from "../hooks/useWorkspacePresentState";
import { sortedFrames } from "./cameraFrameOps";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { resolveTransform } from "../types/block";
import { getWorkspaceViewportSize } from "../hooks/useWorkspaceViewportControls";
import { fitWorkspaceCamera } from "./workspaceViewport";

interface AgentViewFocus {
  seq: number;
  mode?: string;
  blockIds?: string[];
  /** Blocks the camera frames; selection (blockIds) never changes the framing. */
  fitIds?: string[];
  zoom?: number;
  presentation?: "slides" | "frames";
  frameId?: string;
}

const DEFAULT_TRANSFORM = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

/** Reads the focus request the AI stored next to the camera, if any. */
export function readAgentViewFocus(camera: unknown): AgentViewFocus | null {
  const focus = camera && typeof camera === "object" ? (camera as { focus?: unknown }).focus : undefined;
  if (!focus || typeof focus !== "object") return null;
  const seq = Number((focus as { seq?: unknown }).seq);
  return Number.isFinite(seq) ? focus as AgentViewFocus : null;
}

/**
 * The server fits against a fixed viewport; once the board is adopted the real
 * canvas size is known, so re-fit the requested blocks (or the whole board)
 * against it and select the named blocks. Pan and zoom already carry exact
 * values and are left as stored; zoom is recomputed around the real viewport centre.
 */
export function applyAgentViewFocus(focus: AgentViewFocus, previous?: { x: number; y: number; zoom: number } | null): void {
  const state = useWorkspaceStore.getState();
  if (focus.mode === "present") {
    if (focus.presentation === "slides" && focus.blockIds?.[0]) requestSlidePresentation(focus.blockIds[0]);
    else if (focus.presentation === "frames") {
      const frames = sortedFrames(state.frames).filter((frame) => !frame.hiddenInPresentation);
      const index = frames.findIndex((frame) => frame.id === focus.frameId);
      if (index >= 0) { startWorkspacePresenting(); setWorkspacePresentIndex(index); }
    }
    return;
  }
  if (focus.mode === "zoom" && focus.zoom !== undefined && previous && previous.zoom > 0) {
    // Zoom around the centre of the real canvas, starting from the view the user had.
    const { width, height } = getWorkspaceViewportSize();
    const centerX = (width / 2 - previous.x) / previous.zoom;
    const centerY = (height / 2 - previous.y) / previous.zoom;
    state.setCamera({ x: width / 2 - centerX * focus.zoom, y: height / 2 - centerY * focus.zoom, zoom: focus.zoom });
    return;
  }
  const ids = (focus.blockIds ?? []).filter((id) => Boolean(state.blocks[id]));
  if (ids.length > 0) state.setSelection(ids);
  if (focus.mode !== "fit" && focus.mode !== "focus") return;
  const framed = (focus.fitIds ?? []).filter((id) => Boolean(state.blocks[id]));
  // A framed block brings its descendants along, like the server-side fit.
  for (let grew = framed.length > 0; grew;) {
    grew = false;
    for (const [id, block] of Object.entries(state.blocks)) {
      const parent = (block as { parentId?: string }).parentId;
      if (parent && framed.includes(parent) && !framed.includes(id)) { framed.push(id); grew = true; }
    }
  }
  const targets = framed.length > 0 ? framed : Object.keys(state.blocks);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of targets) {
    const transform = resolveTransform(state.blocks[id].transform, DEFAULT_TRANSFORM);
    minX = Math.min(minX, transform.x); minY = Math.min(minY, transform.y);
    maxX = Math.max(maxX, transform.x + transform.w); maxY = Math.max(maxY, transform.y + transform.h);
  }
  if (!Number.isFinite(minX)) return;
  const fitted = fitWorkspaceCamera({ minX, minY, maxX, maxY }, getWorkspaceViewportSize());
  if (focus.mode === "focus" && focus.zoom !== undefined) {
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const { width, height } = getWorkspaceViewportSize();
    state.setCamera({ x: width / 2 - centerX * focus.zoom, y: height / 2 - centerY * focus.zoom, zoom: focus.zoom });
    return;
  }
  state.setCamera(fitted);
}
