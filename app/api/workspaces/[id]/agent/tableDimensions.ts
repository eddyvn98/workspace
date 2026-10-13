import { rec } from "./tableOpsShared";
import type { JsonMap } from "./operationsTables";

/** Weights are relative; the renderer scales them to the block size. Convert
 * them to pixels with the current block size so a px request means pixels. */
function pixelsFromWeights(weights: unknown, count: number, total: number): number[] {
  const valid = Array.isArray(weights) && weights.length === count && weights.every((item) => Number(item) > 0)
    ? (weights as number[]).map(Number) : Array<number>(count).fill(1);
  const sum = valid.reduce((acc, item) => acc + item, 0);
  return valid.map((item) => (item / sum) * total);
}

/** rowHeights/columnWidths (spreadsheet px, default 28/110) only change for the
 * selected rows/columns. Sets px sizes for the given rows/columns, keeps every other row/column at
 * its current pixel size, and resizes the block so weights equal real pixels. */
export function applyTableDimensions(block: JsonMap, data: JsonMap, rowSizes: Map<number, number>, columnSizes: Map<number, number>): void {
  const transform = rec(block.transform);
  const current = { ...rec(transform.computed), ...rec(transform.override) };
  const rows = Number(data.rows);
  const cols = Number(data.cols);
  const round = (list: number[]) => list.map((item) => Math.round(item * 100) / 100);
  if (rowSizes.size) {
    const baseline = pixelsFromWeights(data.rowWeights, rows, Number(current.h) > 0 ? Number(current.h) : 28 * rows);
    rowSizes.forEach((size, index) => { baseline[index] = size; });
    const heights = round(baseline);
    data.rowWeights = heights;
    data.rowHeights = Array.from({ length: rows }, (_, index) => rowSizes.get(index) ?? (Number((data.rowHeights as number[] | undefined)?.[index]) || 28));
    current.h = heights.reduce((sum, item) => sum + item, 0);
  }
  if (columnSizes.size) {
    const baseline = pixelsFromWeights(data.colWeights, cols, Number(current.w) > 0 ? Number(current.w) : 110 * cols);
    columnSizes.forEach((size, index) => { baseline[index] = size; });
    const widths = round(baseline);
    data.colWeights = widths;
    data.columnWidths = Array.from({ length: cols }, (_, index) => columnSizes.get(index) ?? (Number((data.columnWidths as number[] | undefined)?.[index]) || 110));
    current.w = widths.reduce((sum, item) => sum + item, 0);
  }
  block.transform = { ...transform, override: current };
  data.autoFitContent = false;
}
