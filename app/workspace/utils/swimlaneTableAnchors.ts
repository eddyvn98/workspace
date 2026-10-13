import { isTableBlock, resolveTransform, type BlockId, type CanvasBlock, type Transform } from "../types/block";

const FALLBACK_TRANSFORM: Transform = { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 };

/**
 * A swimlane's lane grid is a real `table` block with disableCellAttachment
 * (see workspaceSwimlaneTemplate.ts) - its step shapes sit on top with no
 * parentId/cellItems link, purely by geometry. Lark moves/resizes those
 * shapes together with the table; this is how we find which blocks currently
 * qualify (centered inside the table's own rect, and not already someone
 * else's child).
 */
export function isSwimlaneAnchorTable(block: CanvasBlock | undefined): block is CanvasBlock<"table"> {
  return Boolean(block && isTableBlock(block) && block.data?.disableCellAttachment);
}

export interface SwimlaneCellTarget {
  tableId: BlockId;
  row: number;
  col: number;
}

/**
 * A swimlane body cell with no text yet is rendered pointer-events:none
 * (TableBlock.tsx's passThroughEmptyCellClicks) so a click there falls
 * through to whatever's underneath - a connector crossing the lane, or the
 * canvas background - rather than selecting the cell. That intentionally
 * means `document.elementsFromPoint` never reports the cell itself, so a
 * double-click that WANTS to start editing that cell's text (see
 * WorkspaceCanvas.tsx's dblclick handler) has to be recovered from wherever
 * it actually landed by scanning cell rects directly instead of relying on
 * normal hit-testing.
 */
export function findSwimlaneCellAt(clientX: number, clientY: number): SwimlaneCellTarget | null {
  if (typeof document === "undefined") return null;
  const element = Array.from(document.querySelectorAll<HTMLElement>("[data-workspace-table-cell]")).find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  });
  if (!element) return null;
  const tableId = element.dataset.workspaceTableId;
  const row = Number(element.dataset.workspaceTableRow);
  const col = Number(element.dataset.workspaceTableCol);
  if (!tableId || !Number.isInteger(row) || !Number.isInteger(col)) return null;
  return { tableId, row, col };
}

export function findSwimlaneAnchoredBlockIds(
  blocks: Record<BlockId, CanvasBlock>,
  table: CanvasBlock<"table">,
): BlockId[] {
  const rect = resolveTransform(table.transform, FALLBACK_TRANSFORM);
  const ids: BlockId[] = [];
  for (const block of Object.values(blocks)) {
    if (block.id === table.id || block.parentId) continue;
    const t = resolveTransform(block.transform, FALLBACK_TRANSFORM);
    const cx = t.x + t.w / 2;
    const cy = t.y + t.h / 2;
    if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) {
      ids.push(block.id);
    }
  }
  return ids;
}

function cumulativeWeightFractions(weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const bounds = [0];
  let running = 0;
  for (const weight of weights) {
    running += weight;
    bounds.push(running / total);
  }
  return bounds;
}

function bandIndexForFraction(bounds: number[], fraction: number): number {
  for (let index = 0; index < bounds.length - 1; index += 1) {
    if (fraction <= bounds[index + 1] || index === bounds.length - 2) return index;
  }
  return 0;
}

/**
 * Dragging a row/column divider (TableResizeHandles) redistributes
 * rowWeights/colWeights without touching the table's own transform - a
 * lane's own band just gets taller/shorter or wider/narrower in place. Lark
 * only carries the shapes in the affected band along by translation here
 * (unlike the outer-resize scale in useBlockResize.ts, which resizes the
 * shape itself): the shape didn't stretch, only the band's boundary moved,
 * so it keeps its own size and its exact pixel offset from the band's start
 * edge.
 *
 * `anchoredTransforms` MUST be a snapshot taken once at the start of a
 * continuous divider drag (see TableBlock.tsx), not a live re-read on every
 * tick - TableResizeHandles computes newRowWeights/newColWeights relative to
 * a FIXED baseline captured at its own pointerdown, so every tick's
 * old->new is relative to that same original layout. Reading the anchored
 * blocks' live (already-moved-by-a-previous-tick) transform here instead
 * would re-derive each shape's band against a position that has already
 * shifted while the weights are still measured from the original baseline,
 * double-applying the scale and making shapes drift wildly within a single
 * fast drag.
 */
export function applyTableWeightResizeToAnchors(
  anchoredTransforms: Record<BlockId, Transform>,
  table: CanvasBlock<"table">,
  oldRowWeights: number[],
  oldColWeights: number[],
  newRowWeights: number[],
  newColWeights: number[],
  updateBlockTransform: (id: BlockId, patch: Partial<Transform>, kind: "override" | "computed") => void,
) {
  const anchoredIds = Object.keys(anchoredTransforms);
  if (anchoredIds.length === 0) return;

  const tableTransform = resolveTransform(table.transform, FALLBACK_TRANSFORM);
  const oldRowBounds = cumulativeWeightFractions(oldRowWeights);
  const oldColBounds = cumulativeWeightFractions(oldColWeights);
  const newRowBounds = cumulativeWeightFractions(newRowWeights);
  const newColBounds = cumulativeWeightFractions(newColWeights);

  for (const id of anchoredIds) {
    const t = anchoredTransforms[id];
    const colFraction = tableTransform.w === 0 ? 0 : (t.x + t.w / 2 - tableTransform.x) / tableTransform.w;
    const rowFraction = tableTransform.h === 0 ? 0 : (t.y + t.h / 2 - tableTransform.y) / tableTransform.h;
    const col = bandIndexForFraction(oldColBounds, colFraction);
    const row = bandIndexForFraction(oldRowBounds, rowFraction);

    const oldBandX = tableTransform.x + oldColBounds[col] * tableTransform.w;
    const newBandX = tableTransform.x + newColBounds[col] * tableTransform.w;
    const oldBandY = tableTransform.y + oldRowBounds[row] * tableTransform.h;
    const newBandY = tableTransform.y + newRowBounds[row] * tableTransform.h;

    updateBlockTransform(
      id,
      {
        x: newBandX + (t.x - oldBandX),
        y: newBandY + (t.y - oldBandY),
      },
      "override",
    );
  }
}
