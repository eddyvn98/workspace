import type { CanvasBlock, DualTransform } from "../types/block";
import type { TableMode } from "../types/table";
import { createBlockId } from "../types/block";
import { fitTableContent } from "./tableAutoFit";

function emptyGrid(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(""));
}

export function createWorkspaceTableBlock(transform: DualTransform, mode: TableMode): CanvasBlock<"table"> {
  const rows = mode === "spreadsheet" ? 5 : 3;
  const cols = mode === "spreadsheet" ? 4 : 3;
  const cells = emptyGrid(rows, cols);
  if (mode === "spreadsheet") cells[0] = ["Item", "Quantity", "Price", "Total"];
  const fit = fitTableContent(cells);
  const now = Date.now();
  const base = transform.override ?? transform.computed ?? { x: 0, y: 0, w: fit.width, h: fit.height, rotation: 0, zIndex: 0 };
  return {
    id: createBlockId(),
    type: "table",
    transform: { ...transform, override: { ...base, w: fit.width, h: fit.height } },
    data: { rows, cols, cells, mode, autoFitContent: true, rowWeights: fit.rowWeights, colWeights: fit.colWeights, ...(mode === "spreadsheet" ? { headerRow: true } : {}) },
    createdAt: now,
    updatedAt: now,
  };
}
