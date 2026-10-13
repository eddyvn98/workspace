import { describe, expect, it } from "vitest";
import { sheetFixture } from "./agentSheetHelpers";
import { shiftLineSpan } from "@/app/workspace/utils/workspaceSpreadsheetStructureShift";

const setup = () => sheetFixture({
  borderInfo: [
    { rangeType: "range", borderType: "border-all", style: "1", color: "#000", range: [{ row: [1, 3], column: [1, 2] }] },
    { rangeType: "cell", value: { row_index: 2, col_index: 3, r: { style: 1, color: "#000" } } },
  ],
  frozen: { type: "rangeBoth", row: 1, col: 1 },
  hiddenRows: [1, 4],
  hiddenCols: [2],
  autoFilter: { range: { row: [0, 5], column: [0, 3] }, filters: { "2": { rowhidden: { "4": 0 }, str: 1, edr: 5, cindex: 2 } }, criteria: { column: 2 } },
  conditionalFormats: [{ type: "default", cellrange: [{ row: [2, 5], column: [1, 1] }], conditionName: "equal", conditionRange: [], conditionValue: ["1"], format: {} }],
  dataValidations: { "2_1": { type: "dropdown", value1: "a,b" } },
  cellLinks: { "3_2": { linkType: "webpage", linkAddress: "https://x.io" } },
  cellNotes: { "4_0": { value: "n" } },
  cellWrap: { "2_2": true },
  cellVerticalAlign: { "5_3": "top" },
  cellFont: { "1_1": "Arial" },
});

describe("sheet structures shift with row/column insert and delete", () => {
  it("shifts every structure on row insert at 2", () => {
    const { run, data } = setup();
    run("insert_table_row", { row: 2 });
    const d = data();
    expect(d.hiddenRows).toEqual([1, 5]);
    expect(d.borderInfo![0]).toMatchObject({ range: [{ row: [1, 4], column: [1, 2] }] });
    expect(d.borderInfo![1]).toMatchObject({ value: { row_index: 3, col_index: 3 } });
    expect(d.frozen).toEqual({ type: "rangeBoth", row: 1, col: 1 });
    expect(d.autoFilter!.range.row).toEqual([0, 6]);
    expect(d.autoFilter!.filters!["2"]).toMatchObject({ rowhidden: { "5": 0 }, str: 1, edr: 6 });
    expect(d.conditionalFormats![0]).toMatchObject({ cellrange: [{ row: [3, 6], column: [1, 1] }] });
    expect(Object.keys(d.dataValidations!)).toEqual(["3_1"]);
    expect(Object.keys(d.cellLinks!)).toEqual(["4_2"]);
    expect(Object.keys(d.cellNotes!)).toEqual(["5_0"]);
    expect(Object.keys(d.cellWrap!)).toEqual(["3_2"]);
    expect(Object.keys(d.cellVerticalAlign!)).toEqual(["6_3"]);
    expect(Object.keys(d.cellFont!)).toEqual(["1_1"]);
  });

  it("grows the frozen block when a row is inserted inside it", () => {
    const { run, data } = setup();
    run("insert_table_row", { row: 1 });
    expect(data().frozen).toEqual({ type: "rangeBoth", row: 2, col: 1 });
  });

  it("shifts every structure on row delete at 1 and drops what lived only there", () => {
    const { run, data } = setup();
    run("delete_table_row", { row: 1 });
    const d = data();
    expect(d.hiddenRows).toEqual([3]);
    expect(d.borderInfo![0]).toMatchObject({ range: [{ row: [1, 2], column: [1, 2] }] });
    expect(d.borderInfo![1]).toMatchObject({ value: { row_index: 1 } });
    expect(d.frozen).toEqual({ type: "rangeBoth", row: 0, col: 1 });
    expect(d.autoFilter!.range.row).toEqual([0, 4]);
    expect(Object.keys(d.cellFont ?? {})).toEqual([]);
    expect(Object.keys(d.dataValidations!)).toEqual(["1_1"]);
    expect(Object.keys(d.cellNotes!)).toEqual(["3_0"]);
  });

  it("shifts every structure on column insert at 1 and delete at 2", () => {
    const { run, data } = setup();
    run("insert_table_column", { column: 1 });
    let d = data();
    expect(d.hiddenCols).toEqual([3]);
    expect(d.borderInfo![0]).toMatchObject({ range: [{ row: [1, 3], column: [2, 3] }] });
    expect(d.frozen).toEqual({ type: "rangeBoth", row: 1, col: 2 });
    expect(d.autoFilter!.range.column).toEqual([0, 4]);
    expect(Object.keys(d.autoFilter!.filters!)).toEqual(["3"]);
    expect(d.autoFilter!.criteria).toEqual({ column: 3 });
    expect(Object.keys(d.dataValidations!)).toEqual(["2_2"]);
    expect(Object.keys(d.cellFont!)).toEqual(["1_2"]);
    run("delete_table_column", { column: 3 });
    d = data();
    expect(d.hiddenCols).toBeUndefined();
    expect(d.autoFilter!.filters).toBeUndefined();
    expect(d.autoFilter!.criteria).toBeUndefined();
    expect(d.borderInfo![0]).toMatchObject({ range: [{ row: [1, 3], column: [2, 2] }] });
  });

  it("shifts structures of an inactive sheet", () => {
    const { run, block, id } = setup();
    run("add_table_sheet", { name: "Other", data: { rows: 2, cols: 2, cells: [["a", "b"], ["c", "d"]], mode: "spreadsheet" } });
    run("insert_table_row", { sheetId: id, row: 0 });
    const first = block().data.sheets!.find((sheet) => sheet.id === id)!.data;
    expect(first.hiddenRows).toEqual([2, 5]);
    expect(first.frozen).toMatchObject({ row: 2 });
  });

  it("computes inclusive spans for insert and delete", () => {
    expect(shiftLineSpan([2, 4], 3, "insert")).toEqual([2, 5]);
    expect(shiftLineSpan([2, 4], 2, "insert")).toEqual([3, 5]);
    expect(shiftLineSpan([2, 4], 3, "delete")).toEqual([2, 3]);
    expect(shiftLineSpan([3, 3], 3, "delete")).toBeNull();
    expect(shiftLineSpan([2, 4], 5, "delete")).toEqual([2, 4]);
  });
});
