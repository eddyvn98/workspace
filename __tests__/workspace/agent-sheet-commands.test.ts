import { describe, expect, it } from "vitest";
import { engineWorkbook, roundTrip, sheetFixture } from "./agentSheetHelpers";

describe("AI spreadsheet structure commands", () => {
  it("freezes and unfreezes panes", () => {
    const { run, data, block } = sheetFixture();
    expect(run("freeze_table_panes", { rows: 1, columns: 2 })).toHaveLength(1);
    expect(data().frozen).toEqual({ type: "rangeBoth", row: 0, col: 1 });
    expect(engineWorkbook(block())[0].frozen?.range).toEqual({ row_focus: 0, column_focus: 1 });
    run("freeze_table_panes", { rows: 2, columns: 0 });
    expect(data().frozen).toEqual({ type: "rangeRow", row: 1 });
    expect(run("freeze_table_panes", { rows: 99, columns: 0 })).toEqual([]);
    run("freeze_table_panes", { rows: 0, columns: 0 });
    expect(data().frozen).toBeUndefined();
  });

  it("hides and unhides rows and columns by indices or range", () => {
    const { run, data } = sheetFixture();
    run("hide_table_rows", { indices: [1, 3], hidden: true });
    expect(data().hiddenRows).toEqual([1, 3]);
    run("hide_table_rows", { indices: [1], hidden: false });
    expect(data().hiddenRows).toEqual([3]);
    run("hide_table_columns", { range: "B1:C2" });
    expect(data().hiddenCols).toEqual([1, 2]);
    expect(run("hide_table_columns", { indices: [9] })).toEqual([]);
    run("hide_table_columns", { range: { row: [0, 0], column: [1, 2] }, hidden: false });
    expect(data().hiddenCols).toBeUndefined();
  });

  it("sets and clears dropdown validation", () => {
    const { run, data, block } = sheetFixture();
    run("set_table_validation", { range: "C2:C4", params: { type: "dropdown" }, values: ["Open", "Done"] });
    expect(run("set_table_validation", { range: "C2", params: { type: "list" }, values: ["x"] })).toEqual([]);
    expect(Object.keys(data().dataValidations!)).toEqual(["1_2", "2_2", "3_2"]);
    expect(engineWorkbook(block())[0].dataVerification?.["2_2"]).toMatchObject({ type: "dropdown", value1: "Open,Done" });
    expect(run("set_table_validation", { range: "A1", values: ["a,b"] })).toEqual([]);
    expect(run("set_table_validation", { range: "A1:Z99", values: ["a"] })).toEqual([]);
    run("set_table_validation", { range: "C3", clear: true });
    expect(Object.keys(data().dataValidations!)).toEqual(["1_2", "3_2"]);
  });

  it("adds and clears conditional formats", () => {
    const { run, data, block } = sheetFixture();
    run("add_table_conditional_format", { range: "B2:B6", rule: "gt", value: 20, backgroundColor: "#ffcccc" });
    run("add_table_conditional_format", { range: "C2:C6", rule: "between", value: 1, value2: 50, textColor: "#00aa00" });
    run("add_table_conditional_format", { range: "D2:D6", rule: "colorScale" });
    run("add_table_conditional_format", { range: "A2:A6", rule: "duplicate" });
    expect(data().conditionalFormats).toHaveLength(4);
    expect(data().conditionalFormats![0]).toMatchObject({ conditionName: "greaterThan", conditionValue: ["20"], format: { cellColor: "#ffcccc" } });
    expect(engineWorkbook(block())[0].luckysheet_conditionformat_save).toHaveLength(4);
    expect(run("add_table_conditional_format", { range: "B2", rule: "gt", value: "abc" })).toEqual([]);
    expect(run("add_table_conditional_format", { range: "B2", rule: "bogus", value: 1 })).toEqual([]);
    run("add_table_conditional_format", { range: "B3", clear: true });
    expect(data().conditionalFormats).toHaveLength(3);
  });

  it("sets and clears a filter range", () => {
    const { run, data, block } = sheetFixture();
    run("set_table_filter", { range: "A1:D6", column: 1, criteria: { values: ["11"] } });
    expect(data().autoFilter).toMatchObject({ range: { row: [0, 5], column: [0, 3] }, criteria: { column: 1, values: ["11"] } });
    expect(engineWorkbook(block())[0].filter_select).toEqual({ row: [0, 5], column: [0, 3] });
    expect(run("set_table_filter", { range: "A1:D6", column: 9 })).toEqual([]);
    run("set_table_filter", { clear: true, range: "A1:D6" });
    expect(data().autoFilter).toBeUndefined();
  });

  it("sets links (http/https/mailto only) and notes", () => {
    const { run, data, block } = sheetFixture();
    run("set_table_link", { row: 1, column: 0, url: "https://example.com/x", label: "Docs" });
    expect(data().cells[1][0]).toBe("Docs");
    expect(data().cellLinks!["1_0"]).toEqual({ linkType: "webpage", linkAddress: "https://example.com/x" });
    expect(engineWorkbook(block())[0].data![1][0]).toMatchObject({ hl: { r: 1, c: 0 }, un: 1, v: "Docs" });
    run("set_table_link", { row: 2, column: 0, url: "mailto:a@b.co" });
    expect(data().cells[2][0]).toBe("20");
    expect(run("set_table_link", { row: 1, column: 1, url: "javascript:alert(1)" })).toEqual([]);
    run("set_table_note", { row: 3, column: 3, text: "Review" });
    expect(engineWorkbook(block())[0].data![3][3]?.ps?.value).toBe("Review");
    run("set_table_note", { row: 3, column: 3, clear: true });
    run("set_table_link", { row: 1, column: 0, clear: true });
    expect(data().cellNotes).toBeUndefined();
    expect(Object.keys(data().cellLinks!)).toEqual(["2_0"]);
  });

  it("extends update_table_cell_format with border, wrap, vertical align, strikethrough and font", () => {
    const { run, data, block } = sheetFixture();
    run("update_table_cell_format", { range: "A1:B2", border: { style: "medium", color: "#112233", sides: "outer" }, wrap: true, verticalAlign: "top", strikethrough: true, fontFamily: "Arial" });
    expect(data().borderInfo).toEqual([{ rangeType: "range", borderType: "border-outside", style: "8", color: "#112233", range: [{ row: [0, 1], column: [0, 1] }] }]);
    expect(data().cellWrap).toMatchObject({ "0_0": true, "1_1": true });
    expect(data().cellVerticalAlign!["1_0"]).toBe("top");
    expect(data().cellFont!["0_1"]).toBe("Arial");
    expect(data().cellContents![1][1].blocks[0].runs[0].marks?.strikethrough).toBe(true);
    expect(engineWorkbook(block())[0].data![0][0]).toMatchObject({ tb: "2", vt: 1, ff: "Arial", cl: 1 });
    expect(run("update_table_cell_format", { range: "A1", border: { style: "squiggly" } })).toEqual([]);
    run("update_table_cell_format", { range: "A1:B2", border: { style: "none", sides: "all" }, wrap: false });
    expect(data().borderInfo).toHaveLength(2);
    expect(data().cellWrap).toBeUndefined();
  });

  it("sets sheet colour and hidden, but never hides the active or last visible sheet", () => {
    const { run, data, block, id } = sheetFixture();
    expect(run("set_table_sheet_options", { color: "#ff8800" })).toHaveLength(1);
    expect(data().sheetColor).toBe("#ff8800");
    expect(run("set_table_sheet_options", { hidden: true })).toEqual([]);
    run("add_table_sheet", { name: "Two", data: { rows: 2, cols: 2, cells: [["a", "b"], ["c", "d"]], mode: "spreadsheet" } });
    expect(run("set_table_sheet_options", { sheetId: id, hidden: true })).toHaveLength(1);
    expect(engineWorkbook(block()).find((sheet) => sheet.id === id)?.hide).toBe(1);
    expect(run("set_table_sheet_options", { hidden: true })).toEqual([]);
    run("set_table_sheet_options", { sheetId: id, hidden: false, color: "" });
    expect(block().data.sheets!.find((sheet) => sheet.id === id)!.data.sheetHidden).toBeUndefined();
  });

  it("targets inactive sheets by id or name without touching the active one", () => {
    const { run, block, id, data } = sheetFixture();
    run("add_table_sheet", { name: "Budget", data: { rows: 3, cols: 3, cells: [["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]], mode: "spreadsheet" } });
    run("freeze_table_panes", { sheetId: id, rows: 1, columns: 0 });
    run("set_table_note", { sheetName: "sheet1", row: 1, column: 1, text: "on first" });
    run("update_table_cell_format", { sheetId: id, range: "A1", border: { style: "thin" }, wrap: true });
    const first = block().data.sheets!.find((sheet) => sheet.id === id)!.data;
    expect(first.frozen).toEqual({ type: "rangeRow", row: 0 });
    expect(first.cellNotes!["1_1"].value).toBe("on first");
    expect(first.borderInfo).toHaveLength(1);
    expect(data().frozen).toBeUndefined();
    expect(data().borderInfo).toBeUndefined();
    expect(data().cellNotes).toBeUndefined();
    const after = roundTrip(block());
    expect(after.data.sheets!.find((sheet) => sheet.id === id)!.data.frozen).toMatchObject({ type: "rangeRow", row: 0 });
  });

  it("refreshes display text when a number format is set and stores numeric strings as numbers", () => {
    const { run, data, block } = sheetFixture();
    run("update_table_cells", { cells: [{ row: 1, column: 1, value: "1234.5" }, { row: 2, column: 1, value: "0.256" }, { row: 3, column: 1, value: "text" }] });
    expect(data().cellValues![1][1]).toBe(1234.5);
    expect(data().cellValues![3][1]).toBeNull();
    run("update_table_cell_format", { range: "B2", format: { fa: "#,##0.00" } });
    run("update_table_cell_format", { range: "B3", format: { fa: "0.0%" } });
    expect(data().cells[1][1]).toBe("1,234.50");
    expect(data().cells[2][1]).toBe("25.6%");
    expect(data().cellFormats![1][1]).toMatchObject({ fa: "#,##0.00", t: "n" });
    expect(engineWorkbook(block())[0].data![1][1]).toMatchObject({ v: 1234.5, m: "1,234.50" });
    run("update_table_cells", { cells: [{ row: 1, column: 1, value: "9876.5" }] });
    expect(data().cells[1][1]).toBe("9,876.50");
    run("update_table_cell", { row: 4, column: 3, text: "2024-03-09" });
    run("update_table_cell_format", { range: "D5", format: { fa: "dd/mm/yyyy" } });
    expect(data().cells[4][3]).toBe("09/03/2024");
  });

  it("keeps long digit strings such as IDs as text instead of rounding them to numbers", () => {
    const { run, data } = sheetFixture();
    run("update_table_cells", { cells: [{ row: 1, column: 0, value: "1234567890123456789" }, { row: 1, column: 1, value: "42" }] });
    const values = (data().cellValues ?? []) as unknown[][];
    expect(data().cells[1][0]).toBe("1234567890123456789");
    expect(values[1]?.[0]).not.toBe(1234567890123456800);
    expect(values[1]?.[1]).toBe(42);
  });
});
