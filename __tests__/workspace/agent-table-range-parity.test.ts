import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { fortuneSheetToTablePatch, tableBlockToFortuneSheet } from "@/app/workspace/utils/workspaceSpreadsheetData";
import type { CanvasBlock } from "@/app/workspace/types/block";
import type { Sheet } from "@fortune-sheet/core";
import { parseWorkspaceModelProposal } from "@/lib/workspace-agent/proposalValidation";

function fixture(rows = 4, cols = 3) {
  const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Test" };
  const id = applyAgentAction(state, { type: "create_block", blockType: "table", data: { rows: 1, cols: 1, cells: [["A"]] } }).ids[0];
  const block = state.blocks[id] as unknown as CanvasBlock<"table">;
  block.data = { rows, cols, cells: Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => `${row}:${col}`)), autoFitContent: false };
  return { state, id, block };
}

describe("AI table ranges, merge and dimensions", () => {
  it("formats only a rectangular range and keeps values", () => {
    const { state, id, block } = fixture();
    const before = structuredClone(block.data.cells);
    expect(applyAgentAction(state, { type: "update_table_cell_format", blockId: id, range: "B2:C3", bold: true, backgroundColor: "#ffff00" }).ids).toEqual([id]);
    const sheet = tableBlockToFortuneSheet(block);
    expect(sheet.celldata!.filter((cell) => cell.v?.bl === 1).map((cell) => [cell.r, cell.c])).toEqual([[1, 1], [1, 2], [2, 1], [2, 2]]);
    expect(block.data.cells).toEqual(before);
  });
  it("rejects invalid ranges and overlapping partial merges without applying styles", () => {
    const { state, id, block } = fixture();
    block.data.merges = [{ row: 0, col: 0, rowSpan: 2, colSpan: 2 }];
    const before = structuredClone(block.data);
    expect(applyAgentAction(state, { type: "update_table_cell_format", blockId: id, range: "B2:C3", merge: true, bold: true }).ids).toEqual([]);
    expect(applyAgentAction(state, { type: "update_table_cell_format", blockId: id, range: "A1:D2", bold: true }).ids).toEqual([]);
    expect(block.data).toEqual(before);
  });
  it("merges and unmerges while preserving hidden values and emits the actual spreadsheet merge config", () => {
    const { state, id, block } = fixture();
    const before = structuredClone(block.data.cells);
    applyAgentAction(state, { type: "update_table_cell_format", blockId: id, range: { row: [0, 1], column: [0, 1] }, merge: true });
    const merged = tableBlockToFortuneSheet(block);
    expect(merged.celldata!.find((cell) => cell.r === 0 && cell.c === 0)?.v?.mc).toEqual({ r: 0, c: 0, rs: 2, cs: 2 });
    expect(merged.celldata!.find((cell) => cell.r === 1 && cell.c === 1)?.v?.mc).toEqual({ r: 0, c: 0 });
    expect(merged.config?.merge).toEqual({ "0_0": { r: 0, c: 0, rs: 2, cs: 2 } });
    applyAgentAction(state, { type: "update_table_cell_format", blockId: id, range: "A1", merge: false });
    expect(block.data.merges).toEqual([]);
    expect(block.data.cells).toEqual(before);
  });
  it("validates runtime merge and unmerge proposals without losing hidden cell values", () => {
    const { state, id, block } = fixture();
    const before = structuredClone(block.data.cells);
    const action = { type: "update_table_cell_format", blockId: id, range: "A1:B2" };
    const board = { blocks: state.blocks };
    for (const merge of [true, false]) {
      const proposal = parseWorkspaceModelProposal(JSON.stringify({ done: true, message: "", actions: [{ ...action, merge }] }), board);
      expect(applyAgentAction(state, proposal.actions[0]).ids).toEqual([id]);
      expect(block.data.cells).toEqual(before);
      expect(block.data.merges).toEqual(merge ? [{ row: 0, col: 0, rowSpan: 2, colSpan: 2 }] : []);
      const sheet = tableBlockToFortuneSheet(block);
      expect(sheet.config?.merge).toEqual(merge ? { "0_0": { r: 0, c: 0, rs: 2, cs: 2 } } : undefined);
      expect(sheet.celldata!.find((cell) => cell.r === 1 && cell.c === 1)?.v?.mc).toEqual(merge ? { r: 0, c: 0 } : undefined);
      if (!merge) expect(sheet.celldata!.find((cell) => cell.r === 1 && cell.c === 1)?.v?.v).toBe(before[1][1]);
    }
    expect(() => parseWorkspaceModelProposal(JSON.stringify({ done: true, message: "", actions: [{ ...action, merge: "true" }] }), board))
      .toThrow("update_table_cell_format.merge is outside the supported schema");
  });
  it("preserves exact pixel dimensions through spreadsheet conversion and row/column shifts", () => {
    const { state, id, block } = fixture();
    applyAgentAction(state, { type: "update_table_cell_format", blockId: id, range: "B2:C3", rowHeight: 48, columnWidth: 180 });
    const initial = tableBlockToFortuneSheet(block);
    expect(initial.config?.rowlen).toEqual({ 0: 28, 1: 48, 2: 48, 3: 28 });
    expect(initial.config?.columnlen).toEqual({ 0: 110, 1: 180, 2: 180 });
    const edited: Sheet = { ...initial, data: [[{ v: "A" }]], config: { ...initial.config, columnlen: { 0: 210, 1: 180, 2: 180, 5: 140 } } };
    const patch = fortuneSheetToTablePatch(edited, block.data);
    expect(tableBlockToFortuneSheet({ ...block, data: { ...block.data, ...patch } }).config?.columnlen?.[0]).toBe(210);
    expect(patch.cols).toBe(6);
    expect(patch.columnWidths?.[5]).toBe(140);
    expect(patch.autoFitContent).toBe(false);
    applyAgentAction(state, { type: "insert_table_row", blockId: id, row: 1 });
    applyAgentAction(state, { type: "insert_table_column", blockId: id, column: 1 });
    expect(block.data.rowHeights).toEqual([28, 28, 48, 48, 28]);
    expect(block.data.columnWidths).toEqual([110, 110, 180, 180]);
  });
  it("never truncates a table created manually with more than 50 rows or columns", () => {
    const { state, id, block } = fixture(80, 60);
    applyAgentAction(state, { type: "update_table_cell", blockId: id, row: 79, column: 59, text: "Last cell retained" });
    applyAgentAction(state, { type: "update_table_cell_format", blockId: id, range: "BH80", bold: true });
    expect(block.data.rows).toBe(80);
    expect(block.data.cols).toBe(60);
    expect(block.data.cells[79][59]).toBe("Last cell retained");
    applyAgentAction(state, { type: "insert_table_row", blockId: id, row: 80 });
    expect(block.data.rows).toBe(81);
    expect(block.data.cells[79][59]).toBe("Last cell retained");
  });
});
