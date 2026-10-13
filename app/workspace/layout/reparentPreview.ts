import { isStandaloneContentBlockType, resolveTransform, type BlockId, type BlockType, type DualTransform, type Transform } from "../types/block";

export type ReparentPlacement = "child" | "before" | "after";
export type ReparentBlocks = Record<BlockId, {
  id: BlockId;
  parentId?: BlockId;
  isCollapsed?: boolean;
  mapLayout?: { direction?: "right" | "left" | "up" | "down" };
  type?: BlockType;
  transform?: DualTransform;
}>;

const DEFAULT_REPARENT_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

/**
 * A swimlane's steps are ordinary freeform blocks (no parentId - lane
 * membership is purely which table cell they visually sit over, see
 * workspaceSwimlaneTemplate.ts), but the generic drag-to-reparent detection
 * below has no concept of that: it treats every `[data-block-id]` as a
 * potential tree parent/child purely by hover geometry. Left unguarded, that
 * silently assigns a real parentId to a step dragged near a neighboring lane
 * (see canReparentBlock's caller in useBlockDrag.ts), after which the
 * tree-detach snap-back protects that now-accidental parent link and makes
 * the shape resist small drags - exactly the "khó dịch chuyển" symptom.
 * Blocks positioned inside any table's bounds (either side of the drag) are
 * therefore never valid reparent participants.
 */
function isInsideAnyTable(blocks: ReparentBlocks, id: BlockId): boolean {
  const target = blocks[id];
  if (!target?.transform) return false;
  const rect = resolveTransform(target.transform, DEFAULT_REPARENT_TRANSFORM);
  const centerX = rect.x + rect.w / 2;
  const centerY = rect.y + rect.h / 2;
  return Object.values(blocks).some((candidate) => {
    if (candidate.type !== "table" || candidate.id === id || !candidate.transform) return false;
    const tableRect = resolveTransform(candidate.transform, DEFAULT_REPARENT_TRANSFORM);
    return centerX >= tableRect.x && centerX <= tableRect.x + tableRect.w
      && centerY >= tableRect.y && centerY <= tableRect.y + tableRect.h;
  });
}

export function canReparentBlock(
  blocks: ReparentBlocks,
  draggedIds: Iterable<BlockId>,
  targetId: BlockId | null,
): targetId is BlockId {
  if (!targetId) return false;
  const dragged = new Set(draggedIds);
  if (dragged.has(targetId) || !blocks[targetId]) return false;
  if (isStandaloneContentBlockType(blocks[targetId].type)
    || [...dragged].some((id) => isStandaloneContentBlockType(blocks[id]?.type))) return false;
  if (isInsideAnyTable(blocks, targetId) || [...dragged].some((id) => isInsideAnyTable(blocks, id))) return false;
  // Matches legacy Mindmap: a whole map's root can be dragged onto another
  // node to merge the two maps (its own root is just a regular child of an
  // invisible top-level container there — see moveNodesAsChild in
  // useCanvasEvents.reparent.ts, which only ever protects the single
  // absolute tree root, never a per-map root).

  const childrenByParent = new Map<BlockId, BlockId[]>();
  for (const candidate of Object.values(blocks)) {
    if (!candidate.parentId) continue;
    const children = childrenByParent.get(candidate.parentId) ?? [];
    children.push(candidate.id);
    childrenByParent.set(candidate.parentId, children);
  }

  const descendants = new Set<BlockId>();
  const queue = [...dragged];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || descendants.has(current)) continue;
    descendants.add(current);
    queue.push(...(childrenByParent.get(current) ?? []));
  }
  return !descendants.has(targetId);
}

export function getReparentRoots(blocks: ReparentBlocks, draggedIds: Iterable<BlockId>): BlockId[] {
  const dragged = [...new Set(draggedIds)].filter((id) => Boolean(blocks[id]));
  const selected = new Set(dragged);
  return dragged.filter((id) => {
    const seen = new Set<BlockId>();
    let parentId = blocks[id]?.parentId;
    while (parentId && !seen.has(parentId)) {
      if (selected.has(parentId)) return false;
      seen.add(parentId);
      parentId = blocks[parentId]?.parentId;
    }
    return true;
  });
}

export interface ReparentPreviewState {
  targetId: BlockId | null;
  placement: ReparentPlacement;
  ghost: HTMLDivElement | null;
  targetElement: HTMLElement | null;
  outline: string;
  boxShadow: string;
}

export function clearReparentPreview(preview: ReparentPreviewState): void {
  preview.ghost?.remove();
  if (preview.targetElement) {
    preview.targetElement.style.outline = preview.outline;
    preview.targetElement.style.boxShadow = preview.boxShadow;
  }
  preview.targetId = null;
  preview.placement = "child";
  preview.ghost = null;
  preview.targetElement = null;
  preview.outline = "";
  preview.boxShadow = "";
}

export function updateReparentPreview(
  preview: ReparentPreviewState,
  blocks: ReparentBlocks,
  draggedIds: Iterable<BlockId>,
  clientX: number,
  clientY: number,
): BlockId | null {
  if (typeof document === "undefined") return null;

  const dragged = new Set(draggedIds);
  const elementFromPoint = typeof document.elementFromPoint === "function"
    ? document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-block-id]")
    : null;
  const candidates = [...document.querySelectorAll<HTMLElement>("[data-block-id]")]
    .filter((candidate) => {
      const id = candidate.dataset.blockId;
      if (!id || dragged.has(id)) return false;
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .map((element) => ({ element, placement: resolvePlacement(blocks, element.dataset.blockId!, element, clientX, clientY) }))
    .filter((candidate): candidate is { element: HTMLElement; placement: ReparentPlacement } => Boolean(candidate.placement)
      && canReparentBlock(blocks, draggedIds, candidate.element.dataset.blockId ?? null))
    .sort((a, b) => {
      const placementRank = (kind: ReparentPlacement) => kind === "child" ? 0 : 1;
      const rankDelta = placementRank(a.placement) - placementRank(b.placement);
      if (rankDelta !== 0) return rankDelta;
      const ar = a.element.getBoundingClientRect();
      const br = b.element.getBoundingClientRect();
      return ar.width * ar.height - br.width * br.height;
    });
  const fallback = elementFromPoint && !dragged.has(elementFromPoint.dataset.blockId ?? "")
    ? { element: elementFromPoint, placement: resolvePlacement(blocks, elementFromPoint.dataset.blockId ?? "", elementFromPoint, clientX, clientY) }
    : null;
  const candidate = candidates[0] ?? (fallback?.placement ? fallback : null);
  const element = candidate?.element ?? null;
  if (element?.querySelector("[data-workspace-table-cell]") || element?.closest("[data-workspace-table-cell]")) {
    clearReparentPreview(preview);
    return null;
  }
  const targetId = element?.dataset.blockId ?? null;
  if (!canReparentBlock(blocks, draggedIds, targetId)) {
    clearReparentPreview(preview);
    return null;
  }
  const placement = candidate?.placement;
  if (!placement) {
    clearReparentPreview(preview);
    return null;
  }
  if (preview.targetId === targetId && preview.placement === placement) return targetId;

  clearReparentPreview(preview);
  const rect = element!.getBoundingClientRect();
  const ghost = document.createElement("div");
  ghost.dataset.workspaceReparentGhost = "true";
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left - 4}px`,
    top: `${rect.top - 4}px`,
    width: `${rect.width + 8}px`,
    height: `${rect.height + 8}px`,
    border: placement === "child" ? "2px dashed rgb(249 115 22)" : "3px solid rgb(249 115 22)",
    borderRadius: "8px",
    background: "rgb(249 115 22 / 0.08)",
    pointerEvents: "none",
    zIndex: "2147483646",
  });
  ghost.setAttribute("aria-hidden", "true");
  document.body.appendChild(ghost);

  preview.targetId = targetId;
  preview.placement = placement;
  preview.ghost = ghost;
  preview.targetElement = element!;
  preview.outline = element!.style.outline;
  preview.boxShadow = element!.style.boxShadow;
  element!.style.outline = "2px solid rgb(249 115 22)";
  element!.style.boxShadow = "0 0 0 4px rgb(249 115 22 / 0.14)";
  return targetId;
}

function resolveMapDirection(blocks: ReparentBlocks, targetId: BlockId): "right" | "left" | "up" | "down" {
  let currentId: BlockId | undefined = targetId;
  for (let guard = 0; currentId && guard < 1000; guard += 1) {
    const current: ReparentBlocks[BlockId] | undefined = blocks[currentId];
    if (!current) break;
    if (!current.parentId) return current.mapLayout?.direction ?? "right";
    currentId = current.parentId;
  }
  return "right";
}

function resolvePlacement(
  blocks: ReparentBlocks,
  targetId: BlockId,
  element: HTMLElement,
  clientX: number,
  clientY: number,
): ReparentPlacement | null {
  if (!targetId || !blocks[targetId]) return null;
  const rect = element.getBoundingClientRect();
  const direction = resolveMapDirection(blocks, targetId);
  const vertical = direction === "up" || direction === "down";
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const inCore = vertical
    ? clientX >= rect.left + rect.width * 0.25 && clientX <= rect.right - rect.width * 0.25
      && clientY >= rect.top && clientY <= rect.bottom
    : clientY >= rect.top + rect.height * 0.25 && clientY <= rect.bottom - rect.height * 0.25
      && clientX >= rect.left && clientX <= rect.right;
  if (inCore) return "child";

  const siblingOnCrossAxis = vertical
    ? clientY >= rect.top - 32 && clientY <= rect.bottom + 32
      && (clientX < rect.left || clientX > rect.right)
      && Math.abs(clientX - centerX) <= rect.width / 2 + 32
    : clientX >= rect.left - 36 && clientX <= rect.right + 36
      && (clientY < rect.top || clientY > rect.bottom)
      && Math.abs(clientY - centerY) <= rect.height / 2 + 32;
  if (siblingOnCrossAxis && blocks[targetId].parentId) {
    return vertical ? (clientX < centerX ? "before" : "after") : (clientY < centerY ? "before" : "after");
  }

  const inChildZone = direction === "right"
    ? clientX >= centerX && clientX <= rect.right + 36 && clientY >= rect.top - 16 && clientY <= rect.bottom + 16
    : direction === "left"
      ? clientX <= centerX && clientX >= rect.left - 36 && clientY >= rect.top - 16 && clientY <= rect.bottom + 16
      : direction === "down"
        ? clientY >= centerY && clientY <= rect.bottom + 36 && clientX >= rect.left - 16 && clientX <= rect.right + 16
        : clientY <= centerY && clientY >= rect.top - 36 && clientX >= rect.left - 16 && clientX <= rect.right + 16;
  return inChildZone ? "child" : null;
}
