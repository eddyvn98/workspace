// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { buildTableRenderData } from "@/app/workspace/utils/tableRenderData";
import { tableBlockToFortuneSheet } from "@/app/workspace/utils/workspaceSpreadsheetData";
import type { CanvasBlock } from "@/app/workspace/types/block";

function setup() {
  const state: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "Formulas" };
  const id = applyAgentAction(state, { type: "create_block", blockType: "table", data: { rows: 4, cols: 3, mode: "spreadsheet", cells: [["Region", "Amount", ""], ["North", "5", ""], ["South", "7", ""], ["North", "3", ""]] } }).ids[0];
  const reopened = () => JSON.parse(JSON.stringify(state.blocks[id])) as CanvasBlock<"table">;
  return { state, id, reopened };
}

describe("AI formulas persist, reopen and render", () => {
  it("stores IF/SUMIF/ROUND formulas, evaluates them after a JSON round trip and hands them to the sheet engine", () => {
    const { state, id, reopened } = setup();
    const set = (row: number, column: number, formula: string) => applyAgentAction(state, { type: "update_table_formula", blockId: id, row, column, formula });
    set(1, 2, "=SUMIF(A2:A4,\"North\",B2:B4)");
    set(2, 2, "=IF(B3>5,\"high\",\"low\")");
    set(3, 2, "=ROUND(AVERAGE(B2:B4)/3,2)");
    const block = reopened();
    expect(block.data.mode).toBe("spreadsheet");
    const rendered = buildTableRenderData(block);
    expect(rendered.displayGrid.map((row) => row[2])).toEqual(["", "8", "high", "1.67"]);
    expect(rendered.formulaErrors.every((row) => row.every((error) => !error))).toBe(true);
    const sheet = tableBlockToFortuneSheet(block);
    const formulas = (sheet.celldata ?? []).filter((cell) => cell.c === 2 && cell.v && typeof cell.v === "object" && "f" in cell.v).map((cell) => (cell.v as { f?: string }).f);
    expect(formulas).toEqual(["=SUMIF(A2:A4,\"North\",B2:B4)", "=IF(B3>5,\"high\",\"low\")", "=ROUND(AVERAGE(B2:B4)/3,2)"]);
  });

  it("rejects a formula that would create a cycle and keeps the sheet unchanged", () => {
    const { state, id, reopened } = setup();
    applyAgentAction(state, { type: "update_table_formula", blockId: id, row: 1, column: 2, formula: "=C3+1" });
    applyAgentAction(state, { type: "update_table_formula", blockId: id, row: 2, column: 2, formula: "=C2+1" });
    const formulas = reopened().data.formulas as (string | undefined)[][];
    expect(formulas[1][2]).toBe("=C3+1");
    expect(formulas[2]?.[2]).toBeFalsy();
  });
});
