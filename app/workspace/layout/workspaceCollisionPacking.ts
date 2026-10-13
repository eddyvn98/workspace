import type { BlockId, CanvasBlock, MapLayoutSettings } from "../types/block";
import { resolveTransform } from "../types/block";
import { findMapRootId } from "./mapRoot";
import { DESCRIPTION_PANEL_EXTRA_HEIGHT } from "./treeLayout";

const NODE_GAP = 16;
const FLOATING_GAP = 32;
/** Legacy parity (collisionPacking.ts:10): gap between two whole depth levels
 *  of a vertically grown hierarchy. */
const LOGICAL_DEPTH_GAP = 48;
type Axis = "x" | "y";
type Point = { x: number; y: number };
type Box = Point & { w: number; h: number; level: number; id: BlockId };

const DEFAULT_SIZE = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

function boxFor(block: CanvasBlock, point: Point): Box {
  const transform = resolveTransform(block.transform, DEFAULT_SIZE);
  // Description is rendered as a panel directly below the block frame. Treat
  // that panel as part of the occupied box for the final collision pass too;
  // layout calculators do not all share the hierarchy tree's axis math (most
  // notably treeview/org-chart/timeline up/down), so relying only on their
  // measured sizes still leaves cross-family overlaps behind.
  return {
    id: block.id,
    level: 0,
    ...point,
    w: transform.w,
    h: transform.h + (block.description?.trim() ? DESCRIPTION_PANEL_EXTRA_HEIGHT : 0),
  };
}

function depthOf(blocks: Record<BlockId, CanvasBlock>, id: BlockId): number {
  let depth = 0;
  let current = blocks[id];
  for (let guard = 0; current?.parentId && guard < 1000; guard += 1) {
    depth += 1;
    current = blocks[current.parentId];
  }
  return depth;
}

function start(box: Box, axis: Axis) { return axis === "x" ? box.x : box.y; }
function size(box: Box, axis: Axis) { return axis === "x" ? box.w : box.h; }
function crossStart(box: Box, axis: Axis) { return axis === "x" ? box.y : box.x; }
function crossSize(box: Box, axis: Axis) { return axis === "x" ? box.h : box.w; }

function crossOverlaps(a: Box, b: Box, axis: Axis) {
  const a0 = crossStart(a, axis);
  const b0 = crossStart(b, axis);
  return a0 < b0 + crossSize(b, axis) + NODE_GAP
    && b0 < a0 + crossSize(a, axis) + NODE_GAP;
}

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.w + NODE_GAP
    && b.x < a.x + a.w + NODE_GAP
    && a.y < b.y + b.h + NODE_GAP
    && b.y < a.y + a.h + NODE_GAP;
}

function packOnAxis(nodes: Box[], rootId: BlockId, axis: Axis) {
  const original = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const sorted = [...nodes].sort((a, b) => start(a, axis) - start(b, axis) || a.level - b.level || a.id.localeCompare(b.id));
  const placed: Box[] = [];
  for (const node of sorted) {
    let next = start(node, axis);
    for (const other of placed) {
      if (crossOverlaps(node, other, axis)) next = Math.max(next, start(other, axis) + size(other, axis) + NODE_GAP);
    }
    if (axis === "x") node.x = next;
    else node.y = next;
    placed.push(node);
  }

  const root = nodes.find((node) => node.id === rootId);
  const rootOriginal = original.get(rootId);
  if (root && rootOriginal) {
    const delta = axis === "x" ? rootOriginal.x - root.x : rootOriginal.y - root.y;
    nodes.forEach((node) => { if (axis === "x") node.x += delta; else node.y += delta; });
  }
  const movement = nodes.reduce((sum, node) => {
    const before = original.get(node.id)!;
    return sum + Math.abs(node.x - before.x) + Math.abs(node.y - before.y);
  }, 0);
  return { nodes, movement };
}

function mapBoxes(
  blocks: Record<BlockId, CanvasBlock>,
  positions: Map<BlockId, Point>,
  rootId: BlockId,
  includeFloating = false,
) {
  return Object.values(blocks)
    .filter((block) => findMapRootId(blocks, block.id) === rootId && positions.has(block.id))
    .filter((block) => includeFloating || !block.isFloating)
    .map((block) => ({ ...boxFor(block, positions.get(block.id)!), level: depthOf(blocks, block.id) }));
}

function packStructuredNodes(blocks: Record<BlockId, CanvasBlock>, positions: Map<BlockId, Point>, rootId: BlockId, layout: MapLayoutSettings) {
  if (layout.family === "flowchart" || layout.family === "swimlane") return;
  const nodes = mapBoxes(blocks, positions, rootId);
  if (!nodes.some((node, index) => nodes.slice(index + 1).some((other) => overlaps(node, other)))) return;
  const primary: Axis = layout.direction === "down" || layout.direction === "up" ? "y" : "x";
  const packedPrimary = packOnAxis(nodes.map((node) => ({ ...node })), rootId, primary);
  const packedSecondary = packOnAxis(nodes.map((node) => ({ ...node })), rootId, primary === "x" ? "y" : "x");
  const selected = packedPrimary.movement <= packedSecondary.movement ? packedPrimary.nodes : packedSecondary.nodes;
  selected.forEach((node) => positions.set(node.id, { x: node.x, y: node.y }));
}

/**
 * Legacy parity for `packLogicalDepth` (collisionPacking.ts:173-197).
 *
 * A hierarchy grown up or down is legacy's quarter-turned logical layout. There,
 * separating siblings sideways is not enough: a level whose tallest node grew
 * (a long label, a description panel) can end up level with its own parent. The
 * legacy pass re-centres every depth level a fixed gap past the previous one,
 * measured half-height to half-height, so depth stays readable as depth.
 *
 * Positions here are top-left, legacy's were centres, so every comparison is
 * done on the centre line.
 */
function packLogicalDepth(blocks: Record<BlockId, CanvasBlock>, positions: Map<BlockId, Point>, rootId: BlockId) {
  const nodes = mapBoxes(blocks, positions, rootId);
  const root = nodes.find((node) => node.id === rootId);
  if (!root) return;

  const byLevel = new Map<number, Box[]>();
  for (const node of nodes) byLevel.set(node.level, [...(byLevel.get(node.level) ?? []), node]);
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const deeper = levels.filter((level) => level > root.level);
  const firstChildren = byLevel.get(deeper[0] ?? -1);
  if (!firstChildren?.length) return;

  const centre = (box: Box) => box.y + box.h / 2;
  const mean = (boxes: Box[]) => boxes.reduce((sum, box) => sum + centre(box), 0) / boxes.length;
  // Which way the tree already grew decides which way the levels are pushed.
  const direction = mean(firstChildren) >= centre(root) ? 1 : -1;

  let previousCentre = centre(root);
  let previousHalf = root.h / 2;
  for (const level of deeper) {
    const levelNodes = byLevel.get(level)!;
    const half = Math.max(...levelNodes.map((node) => node.h / 2));
    const target = previousCentre + direction * (previousHalf + LOGICAL_DEPTH_GAP + half);
    const shift = target - mean(levelNodes);
    for (const node of levelNodes) positions.set(node.id, { x: node.x, y: node.y + shift });
    previousCentre = target;
    previousHalf = half;
  }
}

function rect(boxes: Box[]) {
  return {
    left: Math.min(...boxes.map((box) => box.x)),
    top: Math.min(...boxes.map((box) => box.y)),
    right: Math.max(...boxes.map((box) => box.x + box.w)),
    bottom: Math.max(...boxes.map((box) => box.y + box.h)),
  };
}

function rectsOverlap(a: ReturnType<typeof rect>, b: ReturnType<typeof rect>, gap = 0) {
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
}

function avoidFloatingGroups(blocks: Record<BlockId, CanvasBlock>, positions: Map<BlockId, Point>, rootId: BlockId, layout: MapLayoutSettings) {
  if (layout.family === "flowchart" || layout.family === "swimlane") return;
  const candidates = Object.values(blocks).filter((block) => block.isFloating && findMapRootId(blocks, block.id) === rootId);
  const groups = candidates.filter((block) => !block.parentId || !blocks[block.parentId]?.isFloating);
  for (const groupRoot of groups) {
    const ids = new Set<BlockId>();
    const visit = (id: BlockId) => { ids.add(id); Object.values(blocks).filter((block) => block.parentId === id && block.isFloating).forEach((child) => visit(child.id)); };
    visit(groupRoot.id);
    const group = [...ids].map((id) => positions.has(id) ? boxFor(blocks[id], positions.get(id)!) : null).filter((box): box is Box => Boolean(box));
    if (!group.length) continue;
    const groupRect = rect(group);
    const occupied = mapBoxes(blocks, positions, rootId, true).filter((box) => !ids.has(box.id)).map((box) => rect([box]));
    if (!occupied.some((other) => rectsOverlap(groupRect, other))) continue;
    const width = groupRect.right - groupRect.left;
    const height = groupRect.bottom - groupRect.top;
    const proposals = occupied.flatMap((other) => [
      { x: other.right + FLOATING_GAP, y: groupRect.top },
      { x: other.left - width - FLOATING_GAP, y: groupRect.top },
      { x: groupRect.left, y: other.bottom + FLOATING_GAP },
      { x: groupRect.left, y: other.top - height - FLOATING_GAP },
    ]);
    const next = proposals.find((proposal) => !occupied.some((other) => rectsOverlap({ left: proposal.x, top: proposal.y, right: proposal.x + width, bottom: proposal.y + height }, other)));
    if (!next) continue;
    const dx = next.x - groupRect.left;
    const dy = next.y - groupRect.top;
    group.forEach((box) => positions.set(box.id, { x: box.x + dx, y: box.y + dy }));
  }
}

/** Match legacy post-layout collision passes while keeping free-form families user-authored. */
export function avoidWorkspaceNodeOverlaps(
  blocks: Record<BlockId, CanvasBlock>,
  positions: Map<BlockId, Point>,
  rootId: BlockId,
  layout: MapLayoutSettings,
) {
  packStructuredNodes(blocks, positions, rootId, layout);
  if (layout.family === "hierarchy" && (layout.direction === "down" || layout.direction === "up")) {
    packLogicalDepth(blocks, positions, rootId);
  }
  avoidFloatingGroups(blocks, positions, rootId, layout);
}
