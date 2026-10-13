import type { Sheet } from "@fortune-sheet/core";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { fortuneWorkbookToTablePatch, tableBlockToFortuneWorkbook } from "@/app/workspace/utils/workspaceTableWorkbook";
import type { CanvasBlock } from "@/app/workspace/types/block";
import type { TableBlockPayload } from "@/app/workspace/types/table";

export function sheetFixture(extra: Partial<TableBlockPayload> = {}) {
  const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Sheet" };
  const cells = Array.from({ length: 6 }, (_, row) => Array.from({ length: 4 }, (_, col) => (row === 0 ? `H${col}` : String(row * 10 + col))));
  const id = applyAgentAction(state, { type: "create_block", blockType: "table", data: { rows: 6, cols: 4, cells, mode: "spreadsheet", ...extra } }).ids[0];
  const block = () => state.blocks[id] as unknown as CanvasBlock<"table">;
  const run = (type: string, params: Record<string, unknown> = {}) => applyAgentAction(state, { type, blockId: id, ...params }).ids;
  return { state, id, block, run, data: () => block().data };
}

/** Materialises the Fortune workbook the way the engine holds it (data matrix from celldata). */
export function engineWorkbook(block: CanvasBlock<"table">): Sheet[] {
  const sheets = tableBlockToFortuneWorkbook(block);
  return sheets.map((sheet) => {
    const data = Array.from({ length: sheet.row! }, () => Array(sheet.column!).fill(null));
    for (const cell of sheet.celldata!) data[cell.r][cell.c] = cell.v;
    return { ...sheet, data };
  });
}

/** Simulates: open in the editor, optional user edit, onChange -> persisted block. */
export function roundTrip(block: CanvasBlock<"table">, edit?: (sheets: Sheet[]) => void): CanvasBlock<"table"> {
  const workbook = engineWorkbook(block);
  edit?.(workbook);
  const patch = fortuneWorkbookToTablePatch(workbook, block)!;
  return { ...block, data: patch as TableBlockPayload };
}
