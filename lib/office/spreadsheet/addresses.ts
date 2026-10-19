import type { TableSheetRange } from "@/app/workspace/types/table";
import { assertDimensions } from "./limits";
export function address(row: number, col: number): string {
  let letters = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + (n - 1) % 26) + letters;
  return letters + (row + 1);
}
export function parseAddress(value: string): [number, number] {
  const match = /^\$?([A-Z]{1,3})\$?([1-9]\d*)$/i.exec(value);
  if (!match) throw new Error("Unsupported spreadsheet range.");
  const col = [...match[1].toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0), row = Number(match[2]);
  assertDimensions(row, col); return [row - 1, col - 1];
}
export function parseRange(value: string): TableSheetRange {
  const [first, second, extra] = value.split(":");
  if (extra !== undefined) throw new Error("Invalid spreadsheet range.");
  const [r0, c0] = parseAddress(first), [r1, c1] = parseAddress(second ?? first);
  return { row: [Math.min(r0, r1), Math.max(r0, r1)], column: [Math.min(c0, c1), Math.max(c0, c1)] };
}
export const rangeAddress = (range: TableSheetRange) => `${address(range.row[0], range.column[0])}:${address(range.row[1], range.column[1])}`;
