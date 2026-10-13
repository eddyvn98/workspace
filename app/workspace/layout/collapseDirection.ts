import { resolveTransform, type BlockId, type CanvasBlock, type MapLayoutSettings } from "../types/block";

export type WorkspaceCollapseDirection = "left" | "right" | "top" | "bottom" | "horizontal" | "vertical";

type Side = Exclude<WorkspaceCollapseDirection, "horizontal" | "vertical">;

function sideBetween(parent: CanvasBlock, child: CanvasBlock): Side {
  const fallback = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };
  const parentTransform = resolveTransform(parent.transform, fallback);
  const childTransform = resolveTransform(child.transform, fallback);
  const dx = childTransform.x + childTransform.w / 2 - (parentTransform.x + parentTransform.w / 2);
  const dy = childTransform.y + childTransform.h / 2 - (parentTransform.y + parentTransform.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

function isVisibleChild(blockId: BlockId, blocks: Record<BlockId, CanvasBlock>): boolean {
  let current = blocks[blockId];
  for (let guard = 0; current?.parentId && guard < 1000; guard += 1) {
    const parent = blocks[current.parentId];
    if (!parent) return false;
    if (parent.isCollapsed) return false;
    current = parent;
  }
  return Boolean(current);
}

function fallbackDirection(
  block: CanvasBlock,
  blocks: Record<BlockId, CanvasBlock>,
  layout: MapLayoutSettings,
): WorkspaceCollapseDirection {
  const isRoot = !block.parentId || !blocks[block.parentId];
  if (isRoot && layout.family === "hierarchy" && layout.growthMode === "both-side") {
    return layout.direction === "up" || layout.direction === "down" ? "vertical" : "horizontal";
  }
  if (layout.family === "fishbone" && isRoot) return "vertical";
  if (layout.family === "orgchart") return "bottom";
  if (layout.direction === "left") return "left";
  if (layout.direction === "up") return "top";
  if (layout.direction === "down") return "bottom";
  return "right";
}

/**
 * Match legacy resolveCollapseDirections: infer the branch edge from visible
 * child geometry, then fall back to the map's canonical direction. A branch
 * growing on both sides uses a single edge button with a two-axis glyph.
 */
export function resolveWorkspaceCollapseDirection(
  blockId: BlockId,
  blocks: Record<BlockId, CanvasBlock>,
  layout: MapLayoutSettings,
): WorkspaceCollapseDirection {
  const block = blocks[blockId];
  if (!block) return "right";

  const visibleSides = new Set<Side>();
  for (const child of Object.values(blocks)) {
    if (child.parentId !== blockId || !isVisibleChild(child.id, blocks)) continue;
    visibleSides.add(sideBetween(block, child));
  }
  if (visibleSides.has("left") && visibleSides.has("right")) return "horizontal";
  if (visibleSides.has("top") && visibleSides.has("bottom")) return "vertical";
  return [...visibleSides][0] ?? fallbackDirection(block, blocks, layout);
}
