import { describe, expect, it } from "vitest";
import { engineWorkbook, roundTrip, sheetFixture } from "./agentSheetHelpers";
import type { TableBlockPayload } from "@/app/workspace/types/table";

const STRUCTURES: Partial<TableBlockPayload> = {
  borderInfo: [{ rangeType: "range", borderType: "border-all", style: "1", color: "#000000", range: [{ row: [0, 1], column: [0, 2] }] },
    { rangeType: "cell", value: { row_index: 2, col_index: 1, l: { style: 1, color: "#f00" } } }],
  frozen: { type: "rangeBoth", row: 0, col: 1 },
  hiddenRows: [2, 4],
  hiddenCols: [3],
  autoFilter: { range: { row: [0, 5], column: [0, 3] }, filters: { "1": { caljs: {}, rowhidden: { "3": 0 }, optionstate: false, str: 1, edr: 5, cindex: 1 } } },
  conditionalFormats: [{ type: "default", cellrange: [{ row: [1, 5], column: [1, 1] }], conditionName: "greaterThan", conditionRange: [], conditionValue: ["20"], format: { textColor: "#ff0000", cellColor: null } }],
  dataValidations: { "1_2": { type: "dropdown", type2: null, value1: "a,b", value2: "", validity: "", remote: false, prohibitInput: false, hintShow: false, hintValue: "" } },
  cellLinks: { "1_0": { linkType: "webpage", linkAddress: "https://example.com" } },
  cellNotes: { "2_2": { value: "check this", isShow: false, left: null, top: null, width: null, height: null } },
  cellWrap: { "1_1": true },
  cellVerticalAlign: { "1_1": "top", "2_1": "bottom" },
  cellFont: { "0_0": "Arial" },
  sheetColor: "#336699",
};

describe("spreadsheet structure round trip", () => {
  for (const [name, value] of Object.entries(STRUCTURES)) {
    it(`keeps ${name} lossless through the Fortune adapter`, () => {
      const { block } = sheetFixture({ [name]: value } as Partial<TableBlockPayload>);
      const after = roundTrip(block());
      expect(after.data[name as keyof TableBlockPayload]).toEqual(value);
    });
  }

  it("emits Fortune sheet fields for the structures", () => {
    const { block } = sheetFixture(STRUCTURES);
    const sheet = engineWorkbook(block())[0];
    expect(sheet.config?.borderInfo).toHaveLength(2);
    expect(sheet.config?.rowhidden).toEqual({ 2: 0, 4: 0 });
    expect(sheet.config?.colhidden).toEqual({ 3: 0 });
    expect(sheet.frozen).toEqual({ type: "rangeBoth", range: { row_focus: 0, column_focus: 1 } });
    expect(sheet.filter_select).toEqual({ row: [0, 5], column: [0, 3] });
    expect(sheet.dataVerification?.["1_2"].value1).toBe("a,b");
    expect(sheet.hyperlink?.["1_0"].linkAddress).toBe("https://example.com");
    expect(sheet.color).toBe("#336699");
    expect(sheet.data![1][0]).toMatchObject({ hl: { r: 1, c: 0 } });
    expect(sheet.data![2][2]?.ps?.value).toBe("check this");
    expect(sheet.data![1][1]).toMatchObject({ tb: "2", vt: 1 });
    expect(sheet.data![2][1]?.vt).toBe(2);
    expect(sheet.data![0][0]?.ff).toBe("Arial");
  });

  it("persists strikethrough as a cell mark and reads user changes back", () => {
    const { block, run } = sheetFixture();
    run("update_table_cell_format", { range: "A2", strikethrough: true });
    const sheet = engineWorkbook(block())[0];
    expect(sheet.data![1][0]?.cl).toBe(1);
    const cleared = roundTrip(block(), (sheets) => { sheets[0].data![1][0] = { ...sheets[0].data![1][0], cl: 0 }; });
    expect(cleared.data.cellContents![1][0].blocks[0].runs[0].marks?.strikethrough).toBeUndefined();
  });

  it("applies a user's structure edits: new border, unhidden row, removed validation, new wrap", () => {
    const { block } = sheetFixture(STRUCTURES);
    const after = roundTrip(block(), (sheets) => {
      const sheet = sheets[0];
      sheet.config!.borderInfo = [];
      delete sheet.config!.rowhidden;
      sheet.dataVerification = {};
      sheet.data![3][3] = { ...sheet.data![3][3], tb: "2" };
      sheet.data![1][1] = { ...sheet.data![1][1], tb: undefined, vt: 0 };
      sheet.frozen = undefined;
      sheet.filter_select = undefined;
    });
    expect(after.data.borderInfo).toBeUndefined();
    expect(after.data.hiddenRows).toBeUndefined();
    expect(after.data.dataValidations).toBeUndefined();
    expect(after.data.cellWrap).toEqual({ "3_3": true });
    expect(after.data.cellVerticalAlign).toEqual({ "2_1": "bottom" });
    expect(after.data.frozen).toBeUndefined();
    expect(after.data.autoFilter).toBeUndefined();
  });

  it("persists clearing background, text colour, font size and alignment done in the editor", () => {
    const { block, run } = sheetFixture();
    run("update_table_cell_format", { range: "A2:B2", backgroundColor: "#ffff00", textColor: "#ff0000", fontSize: 18, align: "right" });
    expect(block().data.cellBgColor![1][0]).toBe("#ffff00");
    const cleared = roundTrip(block(), (sheets) => {
      const cell = sheets[0].data![1][0]!;
      delete cell.bg; delete cell.fc; delete cell.fs; delete cell.ht;
    });
    expect(cleared.data.cellBgColor?.[1]?.[0]).toBeUndefined();
    expect(cleared.data.cellTextColor?.[1]?.[0]).toBeUndefined();
    expect(cleared.data.cellFontSizes?.[1]?.[0]).toBeUndefined();
    expect(cleared.data.cellAlign?.[1]?.[0]).toBeUndefined();
    expect(cleared.data.cellBgColor![1][1]).toBe("#ffff00");
    expect(cleared.data.cellAlign![1][1]).toBe("right");
  });

  it("keeps every structure per sheet in a multi-sheet workbook across a user edit on another sheet", () => {
    const { block, run, id } = sheetFixture({ sheetColor: "#111111", hiddenRows: [1] });
    run("add_table_sheet", { name: "Second", data: { rows: 3, cols: 3, cells: [["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]], mode: "spreadsheet", frozen: { type: "rangeRow", row: 0 }, cellNotes: { "1_1": { value: "n", isShow: false } } } });
    const second = block().data.activeSheetId!;
    const after = roundTrip(block(), (sheets) => { sheets[0].data![0][0] = { v: "Edited", m: "Edited" }; });
    const first = after.data.sheets!.find((sheet) => sheet.id === id)!;
    const other = after.data.sheets!.find((sheet) => sheet.id === second)!;
    expect(first.data.sheetColor).toBe("#111111");
    expect(first.data.hiddenRows).toEqual([1]);
    expect(first.data.cells[0][0]).toBe("Edited");
    expect(other.data.frozen).toMatchObject({ type: "rangeRow", row: 0 });
    expect(other.data.cellNotes).toEqual({ "1_1": { value: "n", isShow: false, left: null, top: null, width: null, height: null } });
    const reopened = engineWorkbook({ ...block(), data: after.data });
    expect(reopened.find((sheet) => sheet.id === second)?.frozen?.type).toBe("rangeRow");
    expect(reopened.find((sheet) => sheet.id === id)?.config?.rowhidden).toEqual({ 1: 0 });
  });
});
