// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compactAgentBlock } from "@/app/api/workspaces/[id]/agentReadSummary";
import { formatSelectedBlocksContext } from "@/app/workspace/utils/workspaceChatContext";
import { formatTableValue } from "@/app/workspace/utils/tableCellFormat";
import { board, render, run, tbl } from "./agent-table-surface-fixture";

const bold = (text: string) => ({ version: 1, blocks: [{ type: "paragraph", align: "right", runs: [{ text, marks: { bold: true }, fontSize: 18 }] }] });
const plain = (text: string) => ({ version: 1, blocks: [{ type: "paragraph", runs: [{ text }] }] });

describe("formulas through cell commands and batch formula edits", () => {
  const sheet = () => board({ mode: "spreadsheet", rows: 4, cols: 3, cells: [["Qty", "Price", "Total"], ["2", "5", ""], ["3", "7", ""], ["", "", ""]], autoFitContent: false });

  it("routes a value starting with = to the formulas grid in spreadsheet mode (single and batch)", () => {
    const one = run(sheet(), { type: "update_table_cell", row: 1, column: 2, value: "=A2*B2" });
    expect(tbl(one.state).formulas[1][2]).toBe("=A2*B2");
    expect(tbl(one.state).cells[1][2]).toBe("");
    expect(render(one.state).displayGrid[1][2]).toBe("10");
    const many = run(sheet(), { type: "update_table_cells", cells: [{ row: 2, column: 2, value: "=A3*B3" }, { row: 3, column: 0, value: "plain" }, { row: 3, column: 2, formula: "=SUM(C2:C3)" }] });
    expect(tbl(many.state).formulas[2][2]).toBe("=A3*B3");
    expect(tbl(many.state).cells[3][0]).toBe("plain");
    expect(render(many.state).displayGrid[3][2]).toBe("21");
    // Overwriting a formula cell with plain text clears the formula.
    const cleared = run(many.state, { type: "update_table_cell", row: 2, column: 2, value: "n/a" });
    expect(tbl(cleared.state).formulas[2][2]).toBeNull();
  });

  it("keeps = as text in document mode and switches mode for an explicit formula entry", () => {
    const doc = board({ rows: 1, cols: 2, cells: [["", ""]] });
    expect(tbl(run(doc, { type: "update_table_cell", row: 0, column: 0, value: "=1+1" }).state).cells[0][0]).toBe("=1+1");
    const explicit = run(board({ rows: 1, cols: 2, cells: [["4", ""]] }), { type: "update_table_cells", cells: [{ row: 0, column: 1, formula: "=A1*2" }] });
    expect(tbl(explicit.state).mode).toBe("spreadsheet");
    expect(explicit.result.notes?.join(" ")).toMatch(/switched to spreadsheet/);
    expect(render(explicit.state).displayGrid[0][1]).toBe("8");
  });

  it("update_table_formula accepts cells[] and a fill-down range with relative adjustment, and rejects cycles", () => {
    const batch = run(sheet(), { type: "update_table_formula", cells: [{ row: 1, column: 2, formula: "=A2*B2" }, { row: 2, column: 2, formula: "=A3*B3" }] });
    expect(render(batch.state).displayGrid.map((row) => row[2])).toEqual(["Total", "10", "21", ""]);
    const fill = run(sheet(), { type: "update_table_formula", range: "C2:C4", formula: "=A2*$B$2+B2" });
    expect(tbl(fill.state).formulas.map((row: string[]) => row[2])).toEqual([null, "=A2*$B$2+B2", "=A3*$B$2+B3", "=A4*$B$2+B4"]);
    expect(run(sheet(), { type: "update_table_formula", cells: [{ row: 1, column: 2, formula: "=C3" }, { row: 2, column: 2, formula: "=C2" }] }).result.ids).toEqual([]);
    expect(run(sheet(), { type: "update_table_formula", cells: [{ row: 1, column: 2, formula: "5" }] }).result.ids).toEqual([]);
  });
});

describe("rich text survives text edits", () => {
  it("keeps uniform marks, size and alignment; falls back to plain text for mixed runs", () => {
    const state = board({ rows: 1, cols: 3, cells: [["old", "mix", "same"]], cellContents: [[bold("old"), { version: 1, blocks: [{ type: "paragraph", runs: [{ text: "m", marks: { bold: true } }, { text: "ix" }] }] }, plain("same")]] });
    const { state: saved } = run(state, { type: "update_table_cells", cells: [{ row: 0, column: 0, value: "new" }, { row: 0, column: 1, value: "changed" }, { row: 0, column: 2, value: "same" }] });
    expect(render(saved).contentGrid[0][0].blocks[0]).toEqual({ type: "paragraph", align: "right", runs: [{ text: "new", marks: { bold: true }, fontSize: 18 }] });
    expect(render(saved).contentGrid[0][1].blocks[0].runs).toEqual([{ text: "changed" }]);
    expect(render(saved).contentGrid[0][2].blocks[0].runs).toEqual([{ text: "same" }]);
  });
});

describe("row heights and column widths", () => {
  it("changes only the selected rows/columns, writes weights and resizes the block", () => {
    const state = board({ rows: 3, cols: 2, cells: [["a", "b"], ["c", "d"], ["e", "f"]], rowWeights: [40, 40, 40], colWeights: [100, 100], autoFitContent: true });
    state.blocks.tbl.transform = { computed: null, override: { x: 0, y: 0, w: 200, h: 120, zIndex: 1 } };
    const { state: saved } = run(state, { type: "update_table_cell_format", row: 1, rowHeight: 80, columnWidth: 60, column: 0 });
    expect(tbl(saved).rowWeights).toEqual([40, 80, 40]);
    expect(tbl(saved).colWeights).toEqual([60, 100]);
    expect(tbl(saved).autoFitContent).toBe(false);
    expect((saved.blocks.tbl.transform as any).override).toMatchObject({ w: 160, h: 160 });
    const r = render(saved);
    expect(r.rowWeights[1] / r.rowSum).toBeCloseTo(0.5);
    const again = run(saved, { type: "update_table_cell_format", row: 0, rowHeight: 20 });
    expect(tbl(again.state).rowWeights).toEqual([20, 80, 40]);
  });
});

describe("select option removal and rename", () => {
  const sheet = () => board({
    rows: 4, cols: 2, headerRow: true, cells: [["Status", "x"], ["a", ""], ["b", ""], ["a", ""]], columnTypes: ["select", null],
    columnSelectOptions: { 0: [{ id: "a", label: "Open", color: "#111" }, { id: "b", label: "Done", color: "#222" }] },
    filterCol: { col: 0, optionId: "a" },
  });
  it("clears cells holding a removed option, drops its filter and reports it", () => {
    const { result, state } = run(sheet(), { type: "update_table_column", column: 0, removeOptionId: "a" });
    expect(tbl(state).cells.map((row: string[]) => row[0])).toEqual(["Status", "", "b", ""]);
    expect(tbl(state).columnSelectOptions[0].map((option: any) => option.id)).toEqual(["b"]);
    expect(tbl(state).filterCol).toBeNull();
    expect(result.notes?.join(" ")).toMatch(/2 cell\(s\) cleared/);
  });
  it("can remap to another option and renames without touching cells", () => {
    const { state } = run(sheet(), { type: "update_table_column", column: 0, removeOptionId: "Open", replaceWithOption: "b" });
    expect(tbl(state).cells.map((row: string[]) => row[0])).toEqual(["Status", "b", "b", "b"]);
    const renamed = run(sheet(), { type: "update_table_column", column: 0, renameOption: { id: "a", label: "Started" } });
    expect(tbl(renamed.state).columnSelectOptions[0][0].label).toBe("Started");
    expect(tbl(renamed.state).cells.map((row: string[]) => row[0])).toEqual(["Status", "a", "b", "a"]);
    expect(run(sheet(), { type: "update_table_column", column: 0, removeOptionId: "zzz" }).result.ids).toEqual([]);
  });
});

describe("number and date formats show in the renderer", () => {
  it("applies cellFormats.fa in document mode after a format command", () => {
    const state = board({ rows: 2, cols: 3, cells: [["12345.678", "0.256", "2024-03-05"], ["7", "x", ""]], headerRow: false });
    run(state, { type: "update_table_cell_format", row: 0, column: 0, format: { fa: "$#,##0.00" } });
    run(state, { type: "update_table_cell_format", row: 0, column: 1, format: { fa: "0.0%" } });
    const { state: saved } = run(state, { type: "update_table_cell_format", row: 0, column: 2, format: { fa: "dd/mm/yyyy" } });
    const shown = render(saved);
    expect(shown.displayGrid[0]).toEqual(["$12,345.68", "25.6%", "05/03/2024"]);
    expect(shown.contentGrid[0][0].blocks[0].runs[0].text).toBe("$12,345.68");
    expect(shown.grid[0][0]).toBe("12345.678");
  });
  it("formats common patterns and leaves non-numeric text alone", () => {
    expect(formatTableValue(1234.5, "#,##0")).toBe("1,235");
    expect(formatTableValue(-5, "0.00")).toBe("-5.00");
    expect(formatTableValue(5, "000")).toBe("005");
    expect(formatTableValue("abc", "0.00")).toBeUndefined();
    expect(formatTableValue(45000, "yyyy-mm-dd")).toBe("2023-03-15");
    expect(formatTableValue("2024-03-05T14:07:00", "hh:mm")).toBe("14:07");
  });
});

describe("table structure is visible to the model", () => {
  const data = {
    mode: "spreadsheet", headerRow: true, rows: 2, cols: 2, cells: [["Status", "Qty"], ["a", "1"]],
    columnTypes: ["select", "number"], columnSelectOptions: { 0: [{ id: "a", label: "Open", color: "#111" }] },
    merges: [{ row: 1, col: 0, rowSpan: 1, colSpan: 2 }], sortCol: { col: 1, dir: "asc" }, filterCol: { col: 0, optionId: "a" },
    formulas: [[null, null], [null, "=B1*2"]], cellBgColor: [[null, "#fff"], [null, null]],
  };
  it("adds tableMeta to the read summary and the selected-block context", () => {
    const summary = compactAgentBlock("tbl", { id: "tbl", type: "table", data }, "block") as any;
    expect(summary.data.tableMeta).toEqual({
      mode: "spreadsheet", headerRow: true,
      columnTypes: [{ col: 0, type: "select", options: [{ id: "a", label: "Open" }] }, { col: 1, type: "number" }],
      mergeCount: 1, sortCol: { col: 1, dir: "asc" }, filterCol: { col: 0, optionId: "a" }, formulas: { B2: "=B1*2" }, hasColours: true,
    });
    expect(summary.data.tableSummary).toEqual({ rowCount: 2, columnCount: 2 });
    const block = { id: "tbl", type: "table", data, transform: { computed: null, override: { x: 0, y: 0, w: 1, h: 1, rotation: 0, zIndex: 0 } } } as any;
    const context = formatSelectedBlocksContext(["tbl"], { tbl: block });
    expect(context.contextPrompt).toContain("\"formulas\":{\"B2\":\"=B1*2\"}");
    expect(context.contextPrompt).toContain("Table cells=");
  });
});
