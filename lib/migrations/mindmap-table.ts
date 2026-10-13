import type { MindmapNodeLike } from "@/lib/mindmap/repository";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function textContent(value: unknown): string {
  const blocks = record(value).blocks;
  if (!Array.isArray(blocks)) return "";
  return blocks.map((block) => {
    const runs = record(block).runs;
    return Array.isArray(runs) ? runs.map((run) => String(record(run).text ?? "")).join("") : "";
  }).join("\n");
}

function axisEntries(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(record).filter((entry) => typeof entry.id === "string") : [];
}

function emptyGrid(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

export function legacyTableData(node: MindmapNodeLike): RecordValue | undefined {
  const nodeTable = record(node.table);
  const v2 = Object.keys(record(node.tableV2)).length > 0
    ? record(node.tableV2)
    : record(nodeTable.__tableV2);
  if (Object.keys(v2).length > 0) {
    const rows = axisEntries(v2.rows);
    const columns = axisEntries(v2.columns);
    if (rows.length === 0 || columns.length === 0) return undefined;
    const cells = emptyGrid(rows.length, columns.length);
    const cellContents: unknown[][] = emptyGrid(rows.length, columns.length);
    const rowWeights = rows.map((entry) => typeof entry.size === "number" ? entry.size : 1);
    const colWeights = columns.map((entry) => typeof entry.size === "number" ? entry.size : 1);
    for (const cell of Object.values(record(v2.cells))) {
      const value = record(cell);
      const row = rows.findIndex((entry) => entry.id === value.rowId);
      const col = columns.findIndex((entry) => entry.id === value.columnId);
      if (row < 0 || col < 0) continue;
      cells[row][col] = textContent(value.content);
      if (value.content && typeof value.content === "object") cellContents[row][col] = value.content;
    }
    return {
      rows: rows.length,
      cols: columns.length,
      cells,
      cellContents,
      rowWeights,
      colWeights,
      ...(v2.headerRow ? { headerRow: true } : {}),
    };
  }

  const rowCount = typeof nodeTable.rows === "number" ? Math.max(1, Math.floor(nodeTable.rows)) : 0;
  const colCount = typeof nodeTable.columns === "number" ? Math.max(1, Math.floor(nodeTable.columns)) : 0;
  if (rowCount === 0 || colCount === 0) return undefined;
  const cells = emptyGrid(rowCount, colCount);
  const children = new Map((node.children ?? []).map((child) => [child.id, child]));
  const cellNodeIds = record(nodeTable.cellNodeIds);
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      const ids = cellNodeIds[`${row}:${col}`];
      const first = Array.isArray(ids) ? children.get(ids[0]) : undefined;
      if (first) cells[row][col] = first.topic || "";
    }
  }
  return {
    rows: rowCount,
    cols: colCount,
    cells,
    ...(Array.isArray(nodeTable.rowHeights) ? { rowWeights: nodeTable.rowHeights } : {}),
    ...(Array.isArray(nodeTable.columnWidths) ? { colWeights: nodeTable.columnWidths } : {}),
    ...(nodeTable.headerRow ? { headerRow: true } : {}),
  };
}
