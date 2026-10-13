import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { tableBlockToFortuneSheet } from "@/app/workspace/utils/workspaceSpreadsheetData";
import { tableCellContentToHtml } from "@/app/workspace/components/table/tableCellContent";
import type { CanvasBlock } from "@/app/workspace/types/block";

function state(): AgentBoardState {
  return { blocks: {}, blockOrder: [], connectors: {}, title: "Table format parity" };
}

describe("AI table formatting matches canvas and full view", () => {
  it("replays advanced table formulas, formats and column views", () => {
    const board = state();
    const table = applyAgentAction(board, { type: "create_block", blockType: "table" }).ids[0];
    expect(applyAgentAction(board, { type: "update_table_formula", blockId: table, row: 0, column: 1, formula: "=SUM(A1:A3)" }).ids).toEqual([table]);
    expect(applyAgentAction(board, { type: "update_table_cell_format", blockId: table, row: 0, column: 1, fontSize: 18, align: "right", backgroundColor: "#111827", bold: true }).ids).toEqual([table]);
    expect(applyAgentAction(board, { type: "update_table_column", blockId: table, column: 1, columnType: "number", sortDirection: "desc" }).ids).toEqual([table]);
    expect(board.blocks[table].data).toMatchObject({ mode: "spreadsheet", columnTypes: [null, "number", null], sortCol: { col: 1, dir: "desc" } });
    expect(board.blocks[table].data.formulas[0][1]).toBe("=SUM(A1:A3)");
    expect(board.blocks[table].data.cellFontSizes[0][1]).toBe(18);
    expect(board.blocks[table].data.cellContents[0][1].blocks[0].runs[0].marks).toMatchObject({ bold: true });
    expect(JSON.parse(JSON.stringify(board.blocks[table].data))).toEqual(board.blocks[table].data);
  });

  it("renders AI marks on both the canvas rich content and FortuneSheet cells", () => {
    const board = state();
    const table = applyAgentAction(board, { type: "create_block", blockType: "table", data: { rows: 2, cols: 2, cells: [["Header", "Value"], ["A", "20"]] } }).ids[0];
    applyAgentAction(board, { type: "update_table_cell_format", blockId: table, row: 0, column: 0, bold: true, italic: true, underline: true });
    const block = board.blocks[table] as unknown as CanvasBlock<"table">;
    const html = tableCellContentToHtml(block.data.cellContents![0][0]!);
    expect(html).toContain("font-weight:700");
    expect(html).toContain("font-style:italic");
    expect(html).toContain("text-decoration:underline");
    const sheet = tableBlockToFortuneSheet(block);
    expect(sheet.celldata!.find((cell) => cell.r === 0 && cell.c === 0)?.v).toMatchObject({ bl: 1, it: 1, un: 1 });
    applyAgentAction(board, { type: "update_table_cell_format", blockId: table, row: 0, column: 0, bold: false });
    const updated = tableBlockToFortuneSheet(board.blocks[table] as unknown as CanvasBlock<"table">);
    const cell = updated.celldata!.find((cell) => cell.r === 0 && cell.c === 0)!.v;
    expect(cell?.bl).toBeUndefined();
    expect(cell?.it).toBe(1);
    expect(cell?.un).toBe(1);
  });

  it("passes number and date formats to the spreadsheet without destroying raw values or marks", () => {
    const board = state();
    const table = applyAgentAction(board, { type: "create_block", blockType: "table", data: { rows: 1, cols: 2, cells: [["1234.5", "45934"]], cellValues: [[1234.5, 45934]] } }).ids[0];
    applyAgentAction(board, { type: "update_table_cell_format", blockId: table, row: 0, column: 0, bold: true, format: { fa: "#,##0.00", t: "n" } });
    applyAgentAction(board, { type: "update_table_cell_format", blockId: table, row: 0, column: 1, format: { fa: "yyyy-mm-dd", t: "d" } });
    const sheet = tableBlockToFortuneSheet(board.blocks[table] as unknown as CanvasBlock<"table">);
    const number = sheet.celldata!.find((cell) => cell.r === 0 && cell.c === 0)!.v;
    const date = sheet.celldata!.find((cell) => cell.r === 0 && cell.c === 1)!.v;
    expect(number).toMatchObject({ v: 1234.5, bl: 1, ct: { fa: "#,##0.00", t: "n" } });
    expect(date).toMatchObject({ v: 45934, ct: { fa: "yyyy-mm-dd", t: "d" } });
  });
});
