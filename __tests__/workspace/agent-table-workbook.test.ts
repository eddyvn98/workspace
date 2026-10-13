import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { fortuneWorkbookToTablePatch, tableBlockToFortuneWorkbook } from "@/app/workspace/utils/workspaceTableWorkbook";
import { compactAgentBlock } from "@/app/api/workspaces/[id]/agentReadSummary";
import { renameFormulaSheet, shiftFormulaRefs } from "@/app/api/workspaces/[id]/agent/tableFormulaReferences";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";
import type { CanvasBlock } from "@/app/workspace/types/block";
import type { Sheet } from "@fortune-sheet/core";

function fixture() {
  const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Workbook" };
  const id = applyAgentAction(state, { type: "create_block", blockType: "table", data: { rows: 3, cols: 2, cells: [["Sales", "Amount"], ["A", "5"], ["B", "8"]] } }).ids[0];
  const action = (type: string, params = {}) => applyAgentAction(state, { type, blockId: id, ...params }).ids;
  const block = () => state.blocks[id] as unknown as CanvasBlock<"table">;
  return { state, id, action, block };
}

describe("Workspace AI workbook parity", () => {
  it.each([
    { type: "add_table_sheet", blockId: "table-1", name: "Budget", data: { rows: 2, cols: 2, cells: [["Budget", "100"], ["Total", "200"]], formulas: [[null, "=A1+B1"]] } },
    { type: "rename_table_sheet", blockId: "table-1", sheetName: "Sheet1", name: "Sales" },
    { type: "duplicate_table_sheet", blockId: "table-1", sheetId: "sheet-1", name: "Copy" },
    { type: "delete_table_sheet", blockId: "table-1", sheetId: "sheet-1" },
    { type: "reorder_table_sheets", blockId: "table-1", sheetIds: ["sheet-1", "sheet-2"] },
    { type: "select_table_sheet", blockId: "table-1", sheetId: "sheet-1" },
  ])("accepts valid $type proposal", (action) => {
    const proposal = JSON.stringify({ done: false, message: "Updated the workbook.", actions: [action] });
    expect(parseWorkspaceModelProposal(proposal).actions).toEqual([action]);
  });

  it.each([
    [{ type: "add_table_sheet", blockId: "table-1", name: "Budget", extra: true }, /unsupported fields/],
    [{ type: "reorder_table_sheets", blockId: "table-1", sheetIds: [] }, /sheetIds/],
    [{ type: "add_table_sheet", blockId: "table-1", name: "Budget", data: { rows: 500, cols: 200 } }, /50000-cell/],
  ])("rejects invalid workbook proposal", (action, issue) => {
    const proposal = JSON.stringify({ done: false, message: "Updated the workbook.", actions: [action] });
    expect(() => parseWorkspaceModelProposal(proposal)).toThrow(issue);
  });

  it("adds a sheet without losing existing cells, edits an inactive sheet and persists manual sheet switching", () => {
    const { id, action, block } = fixture();
    expect(action("add_table_sheet", { name: "Budget", data: { rows: 2, cols: 2, cells: [["Budget", "100"], ["Total", "200"]] } })).toEqual([id]);
    const budget = block().data.activeSheetId!;
    expect(action("update_table_cell", { sheetId: id, row: 1, column: 1, text: "7" })).toEqual([id]);
    expect(block().data.cells[1][1]).toBe("200");
    const sheets = tableBlockToFortuneWorkbook(block());
    expect(sheets.map((sheet) => [sheet.id, sheet.name, sheet.status])).toEqual([[id, "Sheet1", 0], [budget, "Budget", 1]]);
    const engine: Sheet[] = sheets.map((sheet) => ({ ...sheet, data: Array.from({ length: sheet.row! }, () => Array(sheet.column!).fill(null)) }));
    for (const sheet of engine) for (const cell of sheet.celldata!) sheet.data![cell.r][cell.c] = cell.v;
    engine[0].data![1][1] = { v: 9, m: "9" };
    const patch = fortuneWorkbookToTablePatch(engine, block(), id)!;
    expect(patch.activeSheetId).toBe(id);
    expect(patch.cells![1][1]).toBe("9");
    expect(patch.sheets![1].data.cells[1][1]).toBe("200");
    const reopened = tableBlockToFortuneWorkbook({ ...block(), data: { ...block().data, ...patch } });
    expect(reopened.find((sheet) => sheet.status === 1)?.id).toBe(id);
  });
  it("duplicates independently, validates names and IDs, reorders and prevents deleting the last sheet", () => {
    const { id, action, block } = fixture();
    expect(action("delete_table_sheet")).toEqual([]);
    action("duplicate_table_sheet", { name: "Copy" });
    const copy = block().data.activeSheetId!;
    action("update_table_cell", { row: 1, column: 1, text: "99" });
    expect(block().data.sheets![0].data.cells[1][1]).toBe("5");
    expect(action("rename_table_sheet", { name: "sheet1" })).toEqual([]);
    expect(action("rename_table_sheet", { name: "bad/name" })).toEqual([]);
    expect(action("select_table_sheet", { sheetId: "missing" })).toEqual([]);
    action("reorder_table_sheets", { sheetIds: [copy, id] });
    expect(block().data.sheets!.map((sheet) => sheet.id)).toEqual([copy, id]);
    action("delete_table_sheet", { sheetId: copy });
    expect(block().data.activeSheetId).toBe(id);
    expect(block().data.cells[1][1]).toBe("5");
  });
  it("updates cross-sheet references on structure edits, rename and delete while preserving strings and other sheets", () => {
    const { id, action, block } = fixture();
    action("add_table_sheet", { name: "Budget", data: { rows: 2, cols: 2, cells: [["Formula", ""], ["", ""]], formulas: [["=Sheet1!B2+B2+SUM(Sheet1!B2:B3)"]] } });
    action("insert_table_row", { sheetId: id, row: 1 });
    expect(block().data.formulas![0][0]).toBe("=Sheet1!B3+B2+SUM(Sheet1!B3:B4)");
    action("rename_table_sheet", { sheetId: id, name: "Sales Q4" });
    expect(block().data.formulas![0][0]).toBe("='Sales Q4'!B3+B2+SUM('Sales Q4'!B3:B4)");
    action("delete_table_row", { sheetId: id, row: 2 });
    expect(block().data.formulas![0][0]).toBe("=#REF!+B2+SUM('Sales Q4'!B3:B3)");
    action("delete_table_sheet", { sheetId: id });
    expect(block().data.formulas![0][0]).toBe("=#REF!+B2+SUM(#REF!)");
    expect(shiftFormulaRefs('=IF(A2="A2",Other!A2,A2)', "row", 1, "insert")).toBe('=IF(A3="A2",Other!A2,A3)');
    expect(shiftFormulaRefs("=SUM(A2:A2)", "row", 1, "delete")).toBe("=SUM(#REF!)");
    expect(renameFormulaSheet('="Old!A1"+Old!A1', "Old", "O’Brien")).toBe('="Old!A1"+\'O’Brien\'!A1');
  });
  it("includes exact sheet IDs and names in the compact read without duplicating every grid", () => {
    const { id, action, block } = fixture();
    action("add_table_sheet", { name: "Budget" });
    const summary = compactAgentBlock(id, block() as unknown as Record<string, unknown>, "block");
    expect(summary.data.activeSheetId).toBe(block().data.activeSheetId);
    expect(summary.data.sheets).toEqual(block().data.sheets!.map((sheet) => ({ id: sheet.id, name: sheet.name, rows: sheet.data.rows, cols: sheet.data.cols })));
    expect(summary.data.cells).toBeUndefined();
  });
});
