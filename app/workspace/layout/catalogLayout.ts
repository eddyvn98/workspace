/**
 * Pure grid/catalog auto-arrange layout (no React/store dependencies).
 * See CONTRACTS.md §34 — generic multi-column grid arrange option
 * in WorkspaceArrangeMenu.
 *
 * Geometry & Features:
 * - Multi-column matrix layout anchored at (startX, startY).
 * - Supports column-major (top-to-bottom then wrap) and row-major (left-to-right then wrap) flows.
 * - Dynamic column widths and row heights computed from actual block bounding boxes.
 * - Sizing constants default to ALONG_GAP (horizontal column gutters) and CROSS_GAP (vertical row spacing).
 * - Connection descriptor generator for sequential flow visualization.
 */

import type { BlockId } from "../types/block";
import { ALONG_GAP, CROSS_GAP } from "./treeLayout";

export interface CatalogLayoutSize {
  w: number;
  h: number;
}

export interface CatalogLayoutPoint {
  x: number;
  y: number;
}

export interface CatalogLayoutOptions {
  flow?: "column" | "row";
  columnGap?: number;
  rowGap?: number;
  align?: "start" | "center";
}

export interface CatalogConnectionSpec {
  id: string;
  fromBlockId: BlockId;
  toBlockId: BlockId;
  lineType: "straight" | "orthogonal";
}

const DEFAULT_SIZE: CatalogLayoutSize = { w: 160, h: 80 };

/**
 * Computes {x, y} coordinates for a grid layout anchored at (startX, startY).
 */
export function computeCatalogLayout(
  orderedIds: BlockId[],
  startX: number,
  startY: number,
  columns: number,
  sizes: Map<BlockId, CatalogLayoutSize>,
  options: CatalogLayoutOptions = {},
): Map<BlockId, CatalogLayoutPoint> {
  const out = new Map<BlockId, CatalogLayoutPoint>();
  if (orderedIds.length === 0) {
    return out;
  }

  const colGap = options.columnGap ?? ALONG_GAP;
  const rowGap = options.rowGap ?? CROSS_GAP;
  const flow = options.flow ?? "column";
  const align = options.align ?? "start";

  const totalItems = orderedIds.length;
  const colCount = Math.max(1, Math.min(Math.floor(columns), totalItems));

  if (flow === "row") {
    const rowCount = Math.ceil(totalItems / colCount);
    const colWidths: number[] = new Array(colCount).fill(0);
    const rowHeights: number[] = new Array(rowCount).fill(0);

    for (let i = 0; i < totalItems; i++) {
      const col = i % colCount;
      const row = Math.floor(i / colCount);
      const size = sizes.get(orderedIds[i]) ?? DEFAULT_SIZE;
      colWidths[col] = Math.max(colWidths[col], size.w);
      rowHeights[row] = Math.max(rowHeights[row], size.h);
    }

    const colOffsets: number[] = [startX];
    for (let c = 1; c < colCount; c++) {
      colOffsets[c] = colOffsets[c - 1] + colWidths[c - 1] + colGap;
    }

    const rowOffsets: number[] = [startY];
    for (let r = 1; r < rowCount; r++) {
      rowOffsets[r] = rowOffsets[r - 1] + rowHeights[r - 1] + rowGap;
    }

    for (let i = 0; i < totalItems; i++) {
      const id = orderedIds[i];
      const col = i % colCount;
      const row = Math.floor(i / colCount);
      const size = sizes.get(id) ?? DEFAULT_SIZE;

      const baseX = colOffsets[col];
      const baseY = rowOffsets[row];

      const x = align === "center" ? baseX + (colWidths[col] - size.w) / 2 : baseX;
      const y = align === "center" ? baseY + (rowHeights[row] - size.h) / 2 : baseY;

      out.set(id, { x, y });
    }

    return out;
  }

  // Column-major flow (default)
  const rowsPerCol = Math.ceil(totalItems / colCount);
  let currentX = startX;

  for (let c = 0; c < colCount; c += 1) {
    const colItems = orderedIds.slice(c * rowsPerCol, (c + 1) * rowsPerCol);
    if (colItems.length === 0) continue;

    let colWidth = 0;
    for (const id of colItems) {
      const size = sizes.get(id) ?? DEFAULT_SIZE;
      if (size.w > colWidth) {
        colWidth = size.w;
      }
    }
    if (colWidth === 0) colWidth = DEFAULT_SIZE.w;

    let currentY = startY;
    for (const id of colItems) {
      const size = sizes.get(id) ?? DEFAULT_SIZE;
      const x = align === "center" ? currentX + (colWidth - size.w) / 2 : currentX;
      out.set(id, { x, y: currentY });
      currentY += size.h + rowGap;
    }

    currentX += colWidth + colGap;
  }

  return out;
}

/**
 * Generates sequential flow connectors between arranged blocks in grid order.
 */
export function computeCatalogConnections(
  orderedIds: BlockId[],
  lineType: "straight" | "orthogonal" = "straight",
): CatalogConnectionSpec[] {
  const connections: CatalogConnectionSpec[] = [];
  for (let i = 0; i < orderedIds.length - 1; i++) {
    connections.push({
      id: `${orderedIds[i]}-${orderedIds[i + 1]}`,
      fromBlockId: orderedIds[i],
      toBlockId: orderedIds[i + 1],
      lineType,
    });
  }
  return connections;
}
