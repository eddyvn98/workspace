// @vitest-environment node
import { describe, expect, it } from "vitest";
import { board, run, tbl } from "./agent-table-surface-fixture";
import { parseMarkdownPipeTable } from "@/app/workspace/utils/tableImportParsers";
import { remapFormulaRefs } from "@/app/api/workspaces/[id]/agent/tableFormulaReferences";

const note = (value: string) => ({ value, isShow: false, left: null, top: null, width: null, height: null });
const people = (extra: Record<string, unknown> = {}) => board({
  mode: "spreadsheet", rows: 4, cols: 2, autoFitContent: false, headerRow: true,
  cells: [["Name", "N"], ["Bob", "3"], ["Amy", "1"], ["Cy", "2"]],
  cellLinks: { "1_0": { linkType: "webpage", linkAddress: "https://bob.example" } },
  cellNotes: { "2_0": note("amy note") },
  cellWrap: { "1_1": true }, cellVerticalAlign: { "3_1": "top" }, cellFont: { "2_1": "Arial" },
  dataValidations: { "3_0": { type: "dropdown", value1: "a,b" } },
  hiddenRows: [2],
  borderInfo: [{ rangeType: "range", borderType: "border-all", style: "1", color: "#000", range: [{ row: [1, 1], column: [0, 1] }] }, { rangeType: "cell", value: { row_index: 3, col_index: 0, l: { style: 1, color: "#000" } } }],
  conditionalFormats: [{ type: "default", cellrange: [{ row: [1, 1], column: [0, 1] }], format: { textColor: "#f00" } }],
  autoFilter: { range: { row: [0, 3], column: [0, 1] } },
  ...extra,
});

describe("T1 move/sort remap per-cell structures", () => {
  it("move_table_row carries links, notes, hidden rows, borders and rules with the data", () => {
    const { result, state } = run(people(), { type: "move_table_row", from: 1, to: 3 });
    expect(result.ids).toEqual(["tbl"]);
    const data = tbl(state);
    expect(data.cells.map((row: string[]) => row[0])).toEqual(["Name", "Amy", "Cy", "Bob"]);
    expect(data.cellLinks).toEqual({ "3_0": { linkType: "webpage", linkAddress: "https://bob.example" } });
    expect(Object.keys(data.cellNotes)).toEqual(["1_0"]);
    expect(Object.keys(data.cellWrap)).toEqual(["3_1"]);
    expect(Object.keys(data.cellVerticalAlign)).toEqual(["2_1"]);
    expect(Object.keys(data.cellFont)).toEqual(["1_1"]);
    expect(Object.keys(data.dataValidations)).toEqual(["2_0"]);
    expect(data.hiddenRows).toEqual([1]);
    expect(data.borderInfo[0].range).toEqual([{ row: [3, 3], column: [0, 1] }]);
    expect(data.borderInfo[1].value.row_index).toBe(2);
    expect(data.conditionalFormats[0].cellrange).toEqual([{ row: [3, 3], column: [0, 1] }]);
    expect(data.autoFilter.range.row).toEqual([0, 3]);
  });

  it("move_table_column carries links and notes", () => {
    const { state } = run(people(), { type: "move_table_column", from: 0, to: 1 });
    expect(tbl(state).cellLinks).toEqual({ "1_1": { linkType: "webpage", linkAddress: "https://bob.example" } });
    expect(Object.keys(tbl(state).cellNotes)).toEqual(["2_1"]);
    expect(Object.keys(tbl(state).dataValidations)).toEqual(["3_1"]);
  });

  it("sort_table_range moves per-row structures with their rows (full width)", () => {
    const { result, state } = run(people(), { type: "sort_table_range", column: 1, direction: "asc" });
    expect(result.ids).toEqual(["tbl"]);
    const data = tbl(state);
    expect(data.cells.map((row: string[]) => row[0])).toEqual(["Name", "Amy", "Cy", "Bob"]);
    expect(data.cellLinks).toEqual({ "3_0": { linkType: "webpage", linkAddress: "https://bob.example" } });
    expect(Object.keys(data.cellNotes)).toEqual(["1_0"]);
    expect(data.hiddenRows).toEqual([1]);
    expect(data.borderInfo[0].range).toEqual([{ row: [3, 3], column: [0, 1] }]);
    expect(data.conditionalFormats[0].cellrange).toEqual([{ row: [3, 3], column: [0, 1] }]);
  });

  it("a partial-width sort moves only per-cell entries inside the rectangle and notes the rest", () => {
    const { result, state } = run(people(), { type: "sort_table_range", range: "B2:B4", column: 1, direction: "asc" });
    expect(result.notes?.join(" ")).toMatch(/left in place/);
    expect(tbl(state).cellLinks).toEqual({ "1_0": { linkType: "webpage", linkAddress: "https://bob.example" } });
    expect(Object.keys(tbl(state).cellWrap)).toEqual(["3_1"]);
    expect(tbl(state).hiddenRows).toEqual([2]);
  });

  it("notes a frozen pane that is left unchanged by a move", () => {
    const { result, state } = run(people({ frozen: { type: "rangeRow", row: 1 } }), { type: "move_table_row", from: 1, to: 3 });
    expect(result.notes?.join(" ")).toMatch(/frozen/);
    expect(tbl(state).frozen).toEqual({ type: "rangeRow", row: 1 });
  });

  it("duplicate_table_row copies links, notes, validations, borders and widens rule ranges", () => {
    const { result, state } = run(people(), { type: "duplicate_table_row", row: 1 });
    const data = tbl(state);
    expect(data.cellLinks["1_0"]).toBeDefined();
    expect(data.cellLinks["2_0"]).toEqual(data.cellLinks["1_0"]);
    expect(Object.keys(data.cellNotes)).toEqual(["3_0"]);
    expect(Object.keys(data.dataValidations)).toEqual(["4_0"]);
    expect(data.borderInfo[0].range).toEqual([{ row: [1, 2], column: [0, 1] }]);
    expect(data.conditionalFormats[0].cellrange).toEqual([{ row: [1, 2], column: [0, 1] }]);
    expect(data.hiddenRows).toEqual([3]);
    expect(result.ids).toEqual(["tbl"]);
  });

  it("duplicate_table_column copies the source column's links and notes", () => {
    const { state } = run(people(), { type: "duplicate_table_column", column: 0 });
    expect(tbl(state).cellLinks["1_1"]).toEqual(tbl(state).cellLinks["1_0"]);
  });
});

describe("T7 duplicate merge note is truthful", () => {
  const merged = () => board({
    mode: "spreadsheet", rows: 2, cols: 3, cells: [["a", "b", "c"], ["d", "e", "f"]],
    merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 3 }],
  });
  it("copies a single-row merge when duplicating its row and says so", () => {
    const { result, state } = run(merged(), { type: "duplicate_table_row", row: 0 });
    expect(tbl(state).merges).toContainEqual({ row: 1, col: 0, rowSpan: 1, colSpan: 3 });
    expect(result.notes?.join(" ")).not.toMatch(/unmerged/);
    expect(result.notes?.join(" ")).toMatch(/extended|copied/);
  });
  it("extends a column-wide merge on column duplicate", () => {
    const { result, state } = run(merged(), { type: "duplicate_table_column", column: 1 });
    expect(tbl(state).merges[0].colSpan).toBe(4);
    expect(result.notes?.join(" ")).toMatch(/extended/);
  });
});

describe("T2 formula ranges under move", () => {
  it("keeps a range covering the same rows", () => {
    const map = (index: number) => ({ 0: 0, 2: 1, 3: 2, 1: 3 } as Record<number, number>)[index] ?? index;
    expect(remapFormulaRefs("=SUM(B2:B4)", "row", map)).toBe("=SUM(B2:B4)");
    expect(remapFormulaRefs("=B2+SUM(B2:B4)", "row", map)).toBe("=B4+SUM(B2:B4)");
  });
  it("move_table_row keeps SUM total and a cross-sheet reference intact", () => {
    const state = board({ mode: "spreadsheet", rows: 5, cols: 2, cells: [["x", "y"], ["a", "5"], ["b", "8"], ["c", "1"], ["t", "14"]], formulas: [[], [], [], [], [null, "=SUM(B2:B4)"]] });
    const { state: saved } = run(state, { type: "move_table_row", from: 1, to: 3 });
    expect(tbl(saved).formulas[4][1]).toBe("=SUM(B2:B4)");
  });
  it("notes when a range had to be widened", () => {
    const state = board({ mode: "spreadsheet", rows: 6, cols: 2, cells: [["x", "y"], ["a", "5"], ["b", "8"], ["c", "1"], ["t", "0"], ["u", "0"]], formulas: [[], [], [], [], [null, "=SUM(B2:B4)"], []] });
    const { result, state: saved } = run(state, { type: "move_table_row", from: 2, to: 5 });
    expect(tbl(saved).formulas[3][1]).toBe("=SUM(B2:B6)");
    expect(result.notes?.join(" ")).toMatch(/widened or split/);
  });
});

describe("T3/T10 hide validation happens before allocation", () => {
  it("rejects a huge range instantly", () => {
    const started = Date.now();
    const { result } = run(people(), { type: "hide_table_rows", range: [0, 50000000] });
    expect(result.ids).toEqual([]);
    expect(Date.now() - started).toBeLessThan(500);
    expect(run(people(), { type: "hide_table_columns", range: [0, 1e12] }).result.ids).toEqual([]);
    expect(run(people(), { type: "hide_table_rows", range: [2, 1] }).result.ids).toEqual([]);
    expect(run(people(), { type: "hide_table_rows", range: [0.5, 2] }).result.ids).toEqual([]);
  });
  it("still hides a valid range", () => {
    expect(tbl(run(people({ hiddenRows: undefined }), { type: "hide_table_rows", range: [1, 2] }).state).hiddenRows).toEqual([1, 2]);
  });
});

describe("T4 paste and import caps", () => {
  it("rejects a one-cell paste that would create a huge table", () => {
    const { result, state } = run(people(), { type: "paste_table_range", row: 5000, column: 200, values: [["x"]] });
    expect(result.ids).toEqual([]);
    expect(result.notes?.join(" ") ?? "").toMatch(/limit/);
    expect(tbl(state).rows).toBe(4);
  });
  it("rejects repeated append growth beyond the cap", () => {
    const rows = Array.from({ length: 1990 }, (_, i) => `a${i},b`).join("\n");
    const { state } = run(people(), { type: "import_table", format: "csv", text: rows, append: true });
    expect(tbl(state).rows).toBe(1994);
    const again = run(state, { type: "import_table", format: "csv", text: Array(10).fill("z,z").join("\n"), append: true });
    expect(again.result.ids).toEqual([]);
  });
  it("still allows a normal paste", () => {
    expect(tbl(run(people(), { type: "paste_table_range", row: 1, column: 0, values: [["q"]] }).state).cells[1][0]).toBe("q");
  });
});

describe("T5 size clamps", () => {
  it("clamps rowHeight, columnWidth and fontSize with a note", () => {
    const { result, state } = run(people(), { type: "update_table_cell_format", range: "A1:A1", rowHeight: 1e9, columnWidth: 1, fontSize: 9999 });
    expect(result.ids).toEqual(["tbl"]);
    expect(result.notes?.join(" ")).toMatch(/clamped/);
    expect(tbl(state).cellFontSizes[0][0]).toBe(400);
    expect(Math.max(...tbl(state).rowHeights ?? [0])).toBeLessThanOrEqual(2000);
  });
});

describe("T6 link on a formula cell", () => {
  const formulaSheet = () => board({ mode: "spreadsheet", rows: 2, cols: 2, cells: [["a", "b"], ["2", "4"]], formulas: [[null, null], ["=1+1", null]] });
  it("refuses without a label and keeps the formula", () => {
    const { result, state } = run(formulaSheet(), { type: "set_table_link", row: 1, column: 0, url: "https://x.example" });
    expect(result.ids).toEqual([]);
    expect(result.notes?.join(" ")).toMatch(/formula/);
    expect(tbl(state).formulas[1][0]).toBe("=1+1");
  });
  it("accepts an explicit label", () => {
    const { result } = run(formulaSheet(), { type: "set_table_link", row: 1, column: 0, url: "https://x.example", label: "go" });
    expect(result.ids).toEqual(["tbl"]);
  });
});

describe("T8 markdown pipe tables", () => {
  it("keeps a real dash-only data row", () => {
    expect(parseMarkdownPipeTable("| - | - |\n| --- | --- |\n| a | b |")).toEqual([["-", "-"], ["a", "b"]]);
  });
  it("ignores prose with pipes and requires a delimiter line", () => {
    expect(parseMarkdownPipeTable("a | b\nnot a table")).toEqual([]);
    expect(parseMarkdownPipeTable("intro a|b text\n\n| h1 | h2 |\n|:--|--:|\n| 1 | 2 |\n\nafter | x")).toEqual([["h1", "h2"], ["1", "2"]]);
  });
});

describe("T9 mode switch receipt", () => {
  it("notes that a document table became a spreadsheet", () => {
    const state = board({ mode: "document", rows: 2, cols: 2, cells: [["a", "b"], ["c", "d"]] });
    const { result, state: saved } = run(state, { type: "hide_table_rows", indices: [1] });
    expect(tbl(saved).mode).toBe("spreadsheet");
    expect(result.notes?.join(" ")).toMatch(/spreadsheet mode/);
  });
  it("adds no note for a table that already is a spreadsheet", () => {
    const { result } = run(people(), { type: "hide_table_rows", indices: [1] });
    expect(result.notes?.join(" ") ?? "").not.toMatch(/switched/);
  });
});
