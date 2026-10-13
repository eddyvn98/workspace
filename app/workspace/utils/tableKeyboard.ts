export interface TableCellPosition {
  row: number;
  col: number;
}

export interface TableCellRange {
  start: TableCellPosition;
  end: TableCellPosition;
}

export type TableNavigationDirection = "previous" | "next" | "up" | "down";

export function moveTableCell(
  position: TableCellPosition,
  direction: TableNavigationDirection,
  rows: number,
  cols: number,
): TableCellPosition | null {
  if (rows <= 0 || cols <= 0) return null;
  if (direction === "up") return position.row > 0 ? { row: position.row - 1, col: position.col } : null;
  if (direction === "down") return position.row < rows - 1 ? { row: position.row + 1, col: position.col } : null;

  const offset = direction === "next" ? 1 : -1;
  const nextIndex = position.row * cols + position.col + offset;
  if (nextIndex < 0 || nextIndex >= rows * cols) return null;
  return { row: Math.floor(nextIndex / cols), col: nextIndex % cols };
}

export function isCellInRange(range: TableCellRange | null, position: TableCellPosition): boolean {
  if (!range) return false;
  const minRow = Math.min(range.start.row, range.end.row);
  const maxRow = Math.max(range.start.row, range.end.row);
  const minCol = Math.min(range.start.col, range.end.col);
  const maxCol = Math.max(range.start.col, range.end.col);
  return position.row >= minRow && position.row <= maxRow && position.col >= minCol && position.col <= maxCol;
}
