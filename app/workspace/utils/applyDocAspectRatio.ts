import { resolveTransform, type BlockId, type Transform } from "../types/block";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

const DEFAULT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
const MIN_WIDTH = 120;
const MIN_HEIGHT = 60;

/**
 * Sizes a doc block's frame to the given width/height ratio without
 * clipping its content or leaving a tall blank box underneath it — picking a
 * ratio from WorkspaceSelectionToolbar's frame-ratio popover calls this
 * directly (it has no per-block DOM ref of its own, unlike BlockFrame).
 *
 * Naively deriving height from the current width (h = w / ratio) either
 * clips a taller doc or leaves dead space for a short one. Instead this
 * measures how tall the content actually renders at a candidate width (by
 * briefly forcing the block's root width and reading the content's
 * scrollHeight, then restoring it before paint) and only widens the frame
 * when the ratio-derived height would be too short to hold it. Content
 * height only shrinks or stays the same as width grows (text reflows into
 * more room, it never needs more), so re-deriving the width from that first
 * measurement (w2 = ratio * h1) is guaranteed to fit on a single follow-up
 * check — no iterative search.
 */
export function applyDocAspectRatio(blockId: BlockId, ratio: number) {
  const root = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
  const content = root?.querySelector<HTMLElement>(".workspace-doc-rich-editor");
  if (!root || !content) return;

  const state = useWorkspaceStore.getState();
  const block = state.blocks[blockId];
  if (!block) return;

  const measureHeightAtWidth = (width: number) => {
    const previousWidth = root.style.width;
    root.style.width = `${width}px`;
    void content.offsetHeight; // force layout before reading scrollHeight
    const height = content.scrollHeight;
    root.style.width = previousWidth;
    return height;
  };

  const transform = resolveTransform(block.transform, DEFAULT_TRANSFORM);
  const currentWidth = Math.max(MIN_WIDTH, transform.w);
  const contentHeightAtCurrentWidth = measureHeightAtWidth(currentWidth);
  const desiredHeight = currentWidth / ratio;

  let nextWidth = currentWidth;
  let nextHeight = desiredHeight;
  if (desiredHeight < contentHeightAtCurrentWidth) {
    nextWidth = Math.max(MIN_WIDTH, Math.round(ratio * contentHeightAtCurrentWidth));
    nextHeight = nextWidth / ratio;
  }

  state.updateBlockTransform(blockId, { w: Math.round(nextWidth), h: Math.max(MIN_HEIGHT, Math.round(nextHeight)) }, "override");
}
