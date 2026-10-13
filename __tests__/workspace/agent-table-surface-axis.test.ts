// @vitest-environment node
import { describe, expect, it } from "vitest";
import { board, render, run, tbl } from "./agent-table-surface-fixture";

const att = (id: string) => ({ blockId: id });
const sheet = (merged = false) => board({
  mode: "spreadsheet", rows: 3, cols: 3, autoFitContent: false,
  cells: [["Item", "Qty", "Total"], ["A", "2", ""], ["B", "3", ""]],
  formulas: [[null, null, null], [null, null, "=B2*2"], [null, null, "=B3*3"]],
  cellBgColor: [[null, null, null], ["#111111", null, null], ["#222222", null, null]],
  cellValues: [["Item", "Qty", "Total"], ["A", 2, null], ["B", 3, null]],
  cellContents: [0, 1, 2].map((r) => [0, 1, 2].map((c) => ({ version: 1, blocks: [{ type: "paragraph", runs: [{ text: `r${r}c${c}`, ...(r === 2 ? { marks: { bold: true } } : {}) }] }] }))),
  rowWeights: [40, 50, 60], colWeights: [90, 70, 80],
  columnTypes: [null, "number", null], columnSelectOptions: { 1: [{ id: "x", label: "X", color: "#000" }] },
  cellItems: { "1:0": [att("img")], "2:1": [att("doc")] },
  merges: merged ? [{ row: 0, col: 1, rowSpan: 1, colSpan: 2 }] : [],
});

describe("move_table_row / move_table_column", () => {
  it("moves a row with formulas (re-pointed), colours, contents, weights, values and attachments", () => {
    const { result, state } = run(sheet(true), { type: "move_table_row", from: 2, to: 1 });
    expect(result.ids).toEqual(["tbl"]);
    expect(tbl(state).cells).toEqual([["Item", "Qty", "Total"], ["B", "3", ""], ["A", "2", ""]]);
    expect(tbl(state).formulas[1][2]).toBe("=B2*3");
    expect(tbl(state).formulas[2][2]).toBe("=B3*2");
    expect(tbl(state).cellBgColor[1][0]).toBe("#222222");
    expect(tbl(state).cellBgColor[2][0]).toBe("#111111");
    expect(tbl(state).cellValues[1]).toEqual(["B", 3, null]);
    expect(tbl(state).cellContents[1][0].blocks[0].runs[0]).toEqual({ text: "r2c0", marks: { bold: true } });
    expect(tbl(state).rowWeights).toEqual([40, 60, 50]);
    expect(tbl(state).cellItems).toEqual({ "2:0": [att("img")], "1:1": [att("doc")] });
    expect(tbl(state).merges).toEqual([{ row: 0, col: 1, rowSpan: 1, colSpan: 2 }]);
    expect(render(state).displayGrid.map((row) => row[2])).toEqual(["Total", "9", "4"]);
  });

  it("moves a column with types, options, widths and shifts formula references", () => {
    const state = sheet();
    const { state: saved } = run(state, { type: "move_table_column", from: 1, to: 0 });
    expect(tbl(saved).cells[1]).toEqual(["2", "A", ""]);
    expect(tbl(saved).formulas[1][2]).toBe("=A2*2");
    expect(tbl(saved).columnTypes).toEqual(["number", null, null]);
    expect(Object.keys(tbl(saved).columnSelectOptions)).toEqual(["0"]);
    expect(tbl(saved).colWeights).toEqual([70, 90, 80]);
    expect(tbl(saved).cellItems).toEqual({ "1:1": [att("img")], "2:0": [att("doc")] });
    expect(render(saved).displayGrid[1][2]).toBe("4");
  });

  it("refuses a move across a merge that spans the axis and invalid indices", () => {
    const refused = run(sheet(true), { type: "move_table_column", from: 0, to: 2 });
    expect(refused.result.ids).toEqual([]);
    expect(tbl(refused.state).cells[0]).toEqual(["Item", "Qty", "Total"]);
    expect(run(sheet(), { type: "move_table_row", from: 0, to: 9 }).result.ids).toEqual([]);
  });

  it("re-points other sheets' references after a move", () => {
    const state = board({ ...tbl(sheet()), sheets: undefined });
    const id = "tbl";
    tbl(state).activeSheetId = "s2";
    tbl(state).sheets = [
      { id, name: "Main", data: { rows: 1, cols: 1, cells: [[""]], formulas: [["=Data!C2"]], mode: "spreadsheet" } },
      { id: "s2", name: "Data", data: { ...tbl(state), sheets: undefined, activeSheetId: undefined } },
    ];
    const { state: saved } = run(state, { type: "move_table_row", from: 1, to: 2, sheetName: "Data" });
    expect(tbl(saved).sheets[0].data.formulas[0][0]).toBe("=Data!C3");
  });
});

describe("duplicate_table_row / duplicate_table_column", () => {
  it("duplicates a row below with copied formulas (relative), colours, contents and weight", () => {
    const { result, state } = run(sheet(), { type: "duplicate_table_row", row: 1, count: 2 });
    expect(result.ids).toEqual(["tbl"]);
    expect(tbl(state).rows).toBe(5);
    expect(tbl(state).cells.map((row: string[]) => row[0])).toEqual(["Item", "A", "A", "A", "B"]);
    expect(tbl(state).formulas.map((row: string[]) => row[2])).toEqual([null, "=B2*2", "=B3*2", "=B4*2", "=B5*3"]);
    expect(tbl(state).cellBgColor.map((row: string[]) => row[0])).toEqual([null, "#111111", "#111111", "#111111", "#222222"]);
    expect(tbl(state).cellContents[2][0].blocks[0].runs[0].text).toBe("r1c0");
    expect(tbl(state).rowWeights).toEqual([40, 50, 50, 50, 60]);
    expect(tbl(state).cellItems).toEqual({ "1:0": [att("img")], "4:1": [att("doc")] });
    expect(render(state).displayGrid.map((row) => row[2])).toEqual(["Total", "4", "4", "4", "9"]);
  });

  it("duplicates a column with its type, options and width", () => {
    const { state } = run(sheet(), { type: "duplicate_table_column", column: 1 });
    expect(tbl(state).cols).toBe(4);
    expect(tbl(state).cells[1]).toEqual(["A", "2", "2", ""]);
    expect(tbl(state).columnTypes).toEqual([null, "number", "number", null]);
    expect(tbl(state).columnSelectOptions[2]).toEqual(tbl(state).columnSelectOptions[1]);
    expect(tbl(state).colWeights).toEqual([90, 70, 70, 80]);
    expect(tbl(state).formulas[1][3]).toBe("=B2*2");
    expect(tbl(state).cellItems).toEqual({ "1:0": [att("img")], "2:1": [att("doc")] });
  });

  it("rejects out-of-range rows and absurd counts", () => {
    expect(run(sheet(), { type: "duplicate_table_row", row: 7 }).result.ids).toEqual([]);
    expect(run(sheet(), { type: "duplicate_table_row", row: 1, count: 500 }).result.ids).toEqual([]);
  });
});

describe("insert/delete keep cell attachments attached to their cells", () => {
  it("shifts cellItems keys on row insert and drops them with a deleted column", () => {
    const { state } = run(sheet(), { type: "insert_table_row", row: 1 });
    expect(tbl(state).cellItems).toEqual({ "2:0": [att("img")], "3:1": [att("doc")] });
    const { state: after } = run(state, { type: "delete_table_column", column: 0 });
    expect(tbl(after).cellItems).toEqual({ "3:0": [att("doc")] });
    const { state: shrunk } = run(after, { type: "delete_table_row", row: 3 });
    expect(tbl(shrunk).cellItems).toEqual({});
  });
});
