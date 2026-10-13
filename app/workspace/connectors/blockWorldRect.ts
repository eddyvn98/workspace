import { resolveTransform, type CanvasBlock } from "../types/block";
import { anchorRegistry } from "./anchorRegistry";

const FALLBACK_TRANSFORM = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

/**
 * A block's box in canvas coordinates — the single anchor source for the
 * connector layer.
 *
 * The mounted frame is asked first because it also knows about the live
 * resize/drag previews that never reach the store; the stored transform is
 * the fallback for a block that is not mounted (or a test stub registered
 * before world rects existed). Neither path touches the DOM, so connector
 * geometry no longer depends on layout that React has yet to commit.
 */
export function blockWorldRect(
  blocks: Record<string, CanvasBlock>,
  blockId: string,
): DOMRect | null {
  const registered = anchorRegistry.getBlockWorldRect(blockId);
  if (registered) return registered;
  const block = blocks[blockId];
  if (!block) return null;
  const transform = resolveTransform(block.transform, FALLBACK_TRANSFORM);
  return new DOMRect(transform.x, transform.y, transform.w, transform.h);
}
