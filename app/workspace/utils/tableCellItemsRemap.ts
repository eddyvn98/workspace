import type { TableCellAttachment } from "../types/block";

/** Remaps every cellItems key ("row:col") through mapPosition, dropping any
 *  attachment whose position maps to null (e.g. its row/col was deleted). */
export function remapCellItems(
  cellItems: Record<string, TableCellAttachment[]> | undefined,
  mapPosition: (row: number, col: number) => { row: number; col: number } | null
): Record<string, TableCellAttachment[]> | undefined {
  if (!cellItems) return undefined;

  const remapped: Record<string, TableCellAttachment[]> = {};
  for (const [key, attachments] of Object.entries(cellItems)) {
    const [row, col] = key.split(":").map(Number);
    if (!Number.isInteger(row) || !Number.isInteger(col)) continue;
    const next = mapPosition(row, col);
    if (!next) continue;
    remapped[`${next.row}:${next.col}`] = Array.isArray(attachments)
      ? attachments.map((attachment) => ({ ...attachment }))
      : [];
  }
  return remapped;
}
