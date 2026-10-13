import type { CanvasBlock, Transform } from "../types/block";
import { resolveTransform } from "../types/block";

const FALLBACK_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  w: 160,
  h: 80,
  rotation: 0,
  zIndex: 0,
};

/** Places toolbar-created tables like legacy standalone table roots. */
export function getLegacyTableTransform(
  blocks: Record<string, CanvasBlock>,
): Transform {
  const positioned = Object.values(blocks).map((block) =>
    resolveTransform(block.transform, FALLBACK_TRANSFORM),
  );

  return {
    x: Math.max(1200, ...positioned.map((block) => block.x + block.w + 120)),
    y: Math.min(120, ...positioned.map((block) => block.y - block.h / 2)),
    w: 480,
    h: 300,
    rotation: 0,
    zIndex: positioned.length,
  };
}
