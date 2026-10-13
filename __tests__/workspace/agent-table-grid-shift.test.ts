// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";

function sheet(): AgentBoardState {
  return {
    title: "t",
    blockOrder: ["tbl"],
    blocks: {
      tbl: {
        id: "tbl",
        type: "table",
        transform: { computed: null, override: { x: 0, y: 0, w: 300, h: 120, zIndex: 1 } },
        data: {
          mode: "spreadsheet",
          autoFitContent: false,
          rows: 3,
          cols: 3,
          cells: [["Item", "Qty", "Total"], ["A", "2", "4"], ["B", "3", "9"]],
          cellValues: [["Item", "Qty", "Total"], ["A", 2, 4], ["B", 3, 9]],
          formulas: [[null, null, null], [null, null, "=B2*2"], [null, null, "=B3*3"]],
          cellBgColor: [["#111111", null, null], [null, "#222222", null], [null, null, "#333333"]],
          colWeights: [90, 70, 80],
          rowWeights: [40, 40, 40],
          columnTypes: [null, "number", null],
          columnSelectOptions: { 1: [{ id: "x", label: "X", color: "#000" }] },
          sortCol: { col: 2, dir: "asc" },
        },
      },
    },
    connectors: {},
  };
}

const data = (state: AgentBoardState) => state.blocks.tbl.data as Record<string, any>;

describe("table edits keep per-cell grids attached to their cells", () => {
  it("a row inserted above shifts formulas and colours down with their rows", () => {
    const state = sheet();
    applyAgentAction(state, { type: "insert_table_row", target: "tbl", row: 1, values: ["New", "5", "10"] });
    expect(data(state).cells[1]).toEqual(["New", "5", "10"]);
    expect(data(state).formulas[1]).toEqual([]);
    // Same formulas, now pointing at the shifted rows they were written against.
    expect(data(state).formulas[2][2]).toBe("=B3*2");
    expect(data(state).formulas[3][2]).toBe("=B4*3");
    expect(data(state).cellBgColor[2][1]).toBe("#222222");
    expect(data(state).rowWeights).toHaveLength(4);
    expect(data(state).cellValues[1]).toEqual(["New", 5, 10]);
    expect(data(state).cellValues[2]).toEqual(["A", 2, 4]);
  });

  it("deleting a column removes its grid entries, weights and shifts column-keyed settings", () => {
    const state = sheet();
    applyAgentAction(state, { type: "delete_table_column", target: "tbl", column: 0 });
    expect(data(state).cells[1]).toEqual(["2", "4"]);
    expect(data(state).cellBgColor[1]).toEqual(["#222222", null]);
    expect(data(state).colWeights).toEqual([70, 80]);
    expect(data(state).columnTypes).toEqual(["number", null]);
    expect(Object.keys(data(state).columnSelectOptions)).toEqual(["0"]);
    expect(data(state).sortCol).toEqual({ col: 1, dir: "asc" });
  });

  it("editing a cell updates its raw value too, so the full-view sheet is not stale", () => {
    const state = sheet();
    applyAgentAction(state, { type: "update_table_cell", target: "tbl", row: 1, column: 1, value: "7" });
    expect(data(state).cells[1][1]).toBe("7");
    expect(data(state).cellValues[1][1]).toBe(7);
    applyAgentAction(state, { type: "update_table_cell", target: "tbl", row: 1, column: 0, value: "Apple" });
    expect(data(state).cellValues[1][0]).toBe("Apple");
  });

  it("leaves tables without spreadsheet grids untouched", () => {
    const state: AgentBoardState = { title: "t", blockOrder: ["tbl"], blocks: { tbl: { id: "tbl", type: "table", transform: { computed: null, override: { x: 0, y: 0, w: 200, h: 80, zIndex: 1 } }, data: { rows: 2, cols: 2, cells: [["a", "b"], ["c", "d"]] } } }, connectors: {} };
    applyAgentAction(state, { type: "insert_table_row", target: "tbl", row: 1 });
    expect(data(state).cells).toEqual([["a", "b"], ["", ""], ["c", "d"]]);
    expect(data(state).cellValues).toBeUndefined();
  });
});

describe("formula references follow inserted and deleted rows and columns", () => {
  it("shifts single cells and ranges when a row is inserted above them", async () => {
    const { shiftFormulaRefs } = await import("@/app/api/workspaces/[id]/agent/tableGridShift");
    expect(shiftFormulaRefs("=B2*2", "row", 1, "insert")).toBe("=B3*2");
    expect(shiftFormulaRefs("=B1*2", "row", 1, "insert")).toBe("=B1*2");
    expect(shiftFormulaRefs("=SUM(B2:B5)", "row", 2, "insert")).toBe("=SUM(B2:B6)");
    expect(shiftFormulaRefs("=SUM(B2:B5)", "row", 5, "insert")).toBe("=SUM(B2:B5)");
    expect(shiftFormulaRefs("=$A$2+LOG10(A3)", "row", 0, "insert")).toBe("=$A$3+LOG10(A4)");
  });

  it("shifts columns and keeps function names intact", async () => {
    const { shiftFormulaRefs } = await import("@/app/api/workspaces/[id]/agent/tableGridShift");
    expect(shiftFormulaRefs("=A1+C1", "col", 1, "insert")).toBe("=A1+D1");
    expect(shiftFormulaRefs("=SUM(A1:C1)", "col", 1, "insert")).toBe("=SUM(A1:D1)");
    expect(shiftFormulaRefs("=AVERAGE(B2:B3)", "row", 0, "insert")).toBe("=AVERAGE(B3:B4)");
  });

  it("deleting shifts later refs, shrinks ranges and marks a deleted single cell #REF!", async () => {
    const { shiftFormulaRefs } = await import("@/app/api/workspaces/[id]/agent/tableGridShift");
    expect(shiftFormulaRefs("=B4*2", "row", 1, "delete")).toBe("=B3*2");
    expect(shiftFormulaRefs("=B2*2", "row", 1, "delete")).toBe("=#REF!*2");
    expect(shiftFormulaRefs("=SUM(B2:B5)", "row", 2, "delete")).toBe("=SUM(B2:B4)");
    expect(shiftFormulaRefs("=A1+B1", "col", 0, "delete")).toBe("=#REF!+A1");
  });

  it("rewrites the stored formulas when the AI inserts a row", () => {
    const state = sheet();
    applyAgentAction(state, { type: "insert_table_row", target: "tbl", row: 1 });
    expect(data(state).formulas[2][2]).toBe("=B3*2");
    expect(data(state).formulas[3][2]).toBe("=B4*3");
  });
});
