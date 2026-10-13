import type { CanvasBlock } from "../types/block";
import { createDualTransform, resolveTransform } from "../types/block";
import { fitTableContent } from "./tableAutoFit";
import { createWorkspaceTableBlock } from "./workspaceTableFactory";
import { parseMarkdownPipeTable } from "./tableImportParsers";

// An optional "- Table" label line (as written by exportToMarkdown) plus a run of pipe-table lines.
const PIPE_TABLE = /(^[ \t]*[-*+][ \t]+Table[ \t]*\r?\n)?((?:^[ \t]*\|.*\|[ \t]*(?:\r?\n|$))+)/gm;

/** Pulls markdown pipe tables out of the text so the outline parser does not turn
 * each row into a node; the tables come back as grids. */
export function extractPipeTables(text: string): { text: string; tables: string[][][] } {
  const tables: string[][][] = [];
  const rest = text.replace(PIPE_TABLE, (_whole, _label, body: string) => {
    const grid = parseMarkdownPipeTable(body);
    if (grid.length) tables.push(grid);
    return grid.length ? "" : body;
  });
  return { text: rest, tables };
}

/** Builds document-mode table blocks below the imported blocks. */
export function buildImportedTableBlocks(tables: string[][][], existing: CanvasBlock[]): CanvasBlock[] {
  const fallback = { x: 0, y: 0, w: 240, h: 140, rotation: 0, zIndex: 0 };
  const rects = existing.map((block) => resolveTransform(block.transform, fallback));
  let y = rects.length ? Math.max(...rects.map((rect) => rect.y + rect.h)) + 60 : 0;
  const x = rects.length ? Math.min(...rects.map((rect) => rect.x)) : 0;
  return tables.map((grid) => {
    const cols = Math.max(1, ...grid.map((row) => row.length));
    const cells = grid.map((row) => Array.from({ length: cols }, (_, col) => row[col] ?? ""));
    const fit = fitTableContent(cells);
    const block = createWorkspaceTableBlock(createDualTransform({ x, y, w: fit.width, h: fit.height, rotation: 0, zIndex: 0 }), "document");
    block.data = { ...block.data, rows: cells.length, cols, cells, headerRow: true, rowWeights: fit.rowWeights, colWeights: fit.colWeights };
    y += fit.height + 40;
    return block as CanvasBlock;
  });
}
