// @vitest-environment node
import { describe, expect, it } from "vitest";
import { board, render, run, tbl } from "./agent-table-surface-fixture";

const sheet = (mode: "document" | "spreadsheet" = "spreadsheet") => board({
  mode, headerRow: true, rows: 4, cols: 3, autoFitContent: false,
  cells: [["Name", "Qty", "Total"], ["Bob", "10", ""], ["Amy", "2", ""], ["Cy", "", ""]],
  ...(mode === "spreadsheet" ? { formulas: [[null, null, null], [null, null, "=B2*2"], [null, null, "=B3*2"], [null, null, null]] } : {}),
  cellBgColor: [[null, null, null], ["#bbb", null, null], ["#aaa", null, null], ["#ccc", null, null]],
  rowWeights: [40, 51, 52, 53],
  cellItems: { "1:0": [{ blockId: "b" }] },
  columnTypes: [null, "number", null],
});

describe("sort_table_range", () => {
  it("sorts data rows by a number column, blanks last, keeping the header", () => {
    const { result, state } = run(sheet(), { type: "sort_table_range", column: 1, direction: "asc" });
    expect(result.ids).toEqual(["tbl"]);
    expect(tbl(state).cells.map((row: string[]) => row[0])).toEqual(["Name", "Amy", "Bob", "Cy"]);
    // Formulas travel with their row and re-point at the new row.
    expect(tbl(state).formulas[1][2]).toBe("=B2*2");
    expect(tbl(state).formulas[2][2]).toBe("=B3*2");
    expect(render(state).displayGrid.map((row) => row[2])).toEqual(["Total", "4", "20", ""]);
    expect(tbl(state).cellBgColor.map((row: string[]) => row[0])).toEqual([null, "#aaa", "#bbb", "#ccc"]);
    expect(tbl(state).rowWeights).toEqual([40, 52, 51, 53]);
    expect(tbl(state).cellItems).toEqual({ "2:0": [{ blockId: "b" }] });
    const desc = run(state, { type: "sort_table_range", column: 1, direction: "desc" });
    expect(tbl(desc.state).cells.map((row: string[]) => row[0])).toEqual(["Name", "Bob", "Amy", "Cy"]);
  });

  it("works in document mode on text and sorts a sub-range only", () => {
    const { state } = run(sheet("document"), { type: "sort_table_range", column: 0, direction: "asc" });
    expect(tbl(state).cells.map((row: string[]) => row[0])).toEqual(["Name", "Amy", "Bob", "Cy"]);
    const range = run(sheet("document"), { type: "sort_table_range", range: "A2:B3", column: 0, direction: "asc", hasHeader: false });
    expect(tbl(range.state).cells.map((row: string[]) => row[0])).toEqual(["Name", "Amy", "Bob", "Cy"]);
    const columnOnly = run(sheet("document"), { type: "sort_table_range", range: "B2:B4", column: 1, direction: "asc" });
    expect(tbl(columnOnly.state).cells.map((row: string[]) => row[0])).toEqual(["Name", "Bob", "Amy", "Cy"]);
    expect(tbl(columnOnly.state).cells.map((row: string[]) => row[1])).toEqual(["Qty", "2", "10", ""]);
    expect(tbl(columnOnly.state).rowWeights).toEqual([40, 51, 52, 53]);
  });

  it("refuses ranges that touch merges and bad arguments", () => {
    const merged = sheet("document");
    tbl(merged).merges = [{ row: 1, col: 0, rowSpan: 2, colSpan: 1 }];
    const refused = run(merged, { type: "sort_table_range", column: 1, direction: "asc" });
    expect(refused.result.ids).toEqual([]);
    expect(refused.result.notes?.join(" ")).toMatch(/merged/);
    expect(run(sheet(), { type: "sort_table_range", column: 9, direction: "asc" }).result.ids).toEqual([]);
    expect(run(sheet(), { type: "sort_table_range", column: 1, direction: "up" }).result.ids).toEqual([]);
  });

  it("sorts select columns by option label and warns when a view sort is active", () => {
    const state = sheet("document");
    Object.assign(tbl(state), {
      columnTypes: ["select", null, null],
      columnSelectOptions: { 0: [{ id: "o1", label: "Zed", color: "#000" }, { id: "o2", label: "Ann", color: "#000" }] },
      cells: [["Name", "Qty", "Total"], ["o1", "1", ""], ["o2", "2", ""], ["o1", "3", ""]],
      sortCol: { col: 1, dir: "desc" },
    });
    const { result, state: saved } = run(state, { type: "sort_table_range", column: 0, direction: "asc" });
    expect(tbl(saved).cells.map((row: string[]) => row[0])).toEqual(["Name", "o2", "o1", "o1"]);
    expect(result.notes?.join(" ")).toMatch(/view sort/);
  });
});
