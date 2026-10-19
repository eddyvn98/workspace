import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { importXlsx, exportXlsx } from "@/lib/office/spreadsheet/xlsx";
import { readNativeBackup, writeNativeBackup } from "@/lib/office/spreadsheet/nativeBackup";
import { importedPayload } from "@/lib/office/spreadsheet/payload";
import type { CanvasBlock } from "@/app/workspace/types/block";
import { readCsv, writeCsv } from "@/lib/office/spreadsheet/csv";
import { inspectXlsx } from "@/lib/office/spreadsheet/zipSafety";
import { assertDimensions, assertFormula, assertWorkbook, safeLink } from "@/lib/office/spreadsheet/limits";
import { address, parseRange } from "@/lib/office/spreadsheet/addresses";
import type { TableWorkbookSheet } from "@/app/workspace/types/table";
const fixture = (): TableWorkbookSheet[] => [{ id: "sales", name: "Sales", data: {
  rows: 3, cols: 3, mode: "spreadsheet", cells: [["Name", "Price", "Total"], ["Item", "12.5", "25"], ["Link", "", ""]],
  cellValues: [[undefined, undefined, undefined], [undefined, 12.5, 25]], formulas: [[], [undefined, undefined, "=B2*2"]],
  cellFormats: [[], [undefined, { fa: "#,##0.00" }, { fa: "#,##0.00" }]],
  cellBgColor: [["#112233"]], cellTextColor: [["#ffffff"]], cellFontSizes: [[18]], cellFont: { "0_0": "Arial" },
  cellContents: [[{ version: 1, blocks: [{ type: "paragraph", runs: [{ text: "Name", marks: { bold: true, italic: true, strikethrough: true } }] }] }]],
  cellWrap: { "0_0": true }, cellVerticalAlign: { "0_0": "top" }, cellAlign: [["center"]],
  rowHeights: [32, 28, 28], columnWidths: [180, 120, 120], hiddenRows: [2], hiddenCols: [2],
  frozen: { type: "rangeBoth", row: 0, col: 0 }, sheetColor: "#008800",
  cellLinks: { "2_0": { linkType: "webpage", linkAddress: "https://example.com" } }, cellNotes: { "1_0": { value: "Review" } },
  dataValidations: { "1_0": { type: "dropdown", value1: "Item,Other", prohibitInput: true } },
  borderInfo: [{ rangeType: "range", borderType: "border-all", style: "1", color: "#000000", range: [{ row: [0, 1], column: [0, 2] }] }],
  conditionalFormats: [{ type: "default", cellrange: [{ row: [1, 1], column: [1, 1] }], conditionName: "greaterThan", conditionValue: ["10"], format: { textColor: "#ff0000" } }],
} }, { id: "summary", name: "Summary Q4", data: { rows: 2, cols: 3, cells: [["25", "", ""], ["Merged", "", ""]],
  formulas: [["=Sales!C2"]], merges: [{ row: 1, col: 0, rowSpan: 1, colSpan: 3 }], mode: "spreadsheet" } }];

describe("bounded spreadsheet files", () => {
  it("round-trips sheets, formulas, typed values, rich cell styles and structures through real XLSX bytes", async () => {
    const exported = await exportXlsx(fixture(), "summary");
    const imported = await importXlsx(exported.bytes);
    expect(imported.sheets.map((s) => s.name)).toEqual(["Sales", "Summary Q4"]);
    const sales = imported.sheets[0].data, summary = imported.sheets[1].data;
    expect(imported.activeSheetId).toBe(imported.sheets[1].id);
    expect(sales.cells[1]).toEqual(["Item", "12.5", "25"]);
    expect(sales.cellValues?.[1][1]).toBe(12.5);
    expect(sales.formulas?.[1][2]).toBe("=B2*2");
    expect(summary.formulas?.[0][0]).toBe("=Sales!C2");
    expect(summary.merges).toEqual([{ row: 1, col: 0, rowSpan: 1, colSpan: 3 }]);
    expect(sales.cellBgColor?.[0][0]).toBe("#112233");
    expect(sales.cellTextColor?.[0][0]).toBe("#FFFFFF");
    expect(sales.cellContents?.[0][0].blocks[0].runs[0].marks).toMatchObject({ bold: true, italic: true, strikethrough: true });
    expect(sales.cellFont?.["0_0"]).toBe("Arial");
    expect(sales.cellWrap?.["0_0"]).toBe(true);
    expect(sales.cellVerticalAlign?.["0_0"]).toBe("top");
    expect(sales.cellFormats?.[1][1].fa).toBe("#,##0.00");
    expect(sales.frozen).toEqual({ type: "rangeBoth", row: 0, col: 0 });
    expect(sales.hiddenRows).toEqual([2]); expect(sales.hiddenCols).toEqual([2]);
    expect(sales.rowHeights?.[0]).toBeCloseTo(32); expect(sales.columnWidths?.[0]).toBe(180);
    expect(sales.dataValidations?.["1_0"].value1).toBe("Item,Other");
    expect(sales.cellNotes?.["1_0"].value).toBe("Review");
    expect(sales.cellLinks?.["2_0"].linkAddress).toBe("https://example.com");
    expect(sales.borderInfo?.length).toBeGreaterThan(0);
    expect(sales.conditionalFormats?.[0]).toMatchObject({ conditionName: "greaterThan", conditionValue: ["10"] });
    const edit = imported.sheets; edit[0].data.cells[1][0] = "Changed";
    const reopened = await importXlsx((await exportXlsx(edit, imported.activeSheetId)).bytes);
    expect(reopened.sheets[0].data.cells[1][0]).toBe("Changed");
    expect(reopened.sheets[1].data.formulas?.[0][0]).toBe("=Sales!C2");
  });
  it("preserves formatting and validation on blank template cells", async () => {
    const wb = new ExcelJS.Workbook(), sheet = wb.addWorksheet("Template");
    sheet.getCell("B2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF008800" } };
    sheet.getCell("B2").font = { bold: true, size: 16 };
    sheet.getCell("C3").dataValidation = { type: "list", formulae: ['"Yes,No"'] };
    const restored = await importXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    expect(restored.sheets[0].data.cells[1][1]).toBe("");
    expect(restored.sheets[0].data.cellBgColor?.[1][1]).toBe("#008800");
    expect(restored.sheets[0].data.cellFontSizes?.[1][1]).toBe(16);
    expect(restored.sheets[0].data.dataValidations?.["2_2"].value1).toBe("Yes,No");
  });
  it("restores multi-sheet native backup in-place without importing its block identity", () => {
    const sheets = fixture(), backupBlock = { id: "old-office-block", type: "table",
      data: { ...sheets[0].data, sheets, activeSheetId: "sales" } } as CanvasBlock<"table">;
    const json = writeNativeBackup(backupBlock, "Old file name");
    const source = JSON.parse(json);
    expect(source.blockOrder).toEqual(["old-office-block"]);
    const restored = readNativeBackup(new TextEncoder().encode(json));
    const next = importedPayload(restored);
    expect(next.sheets?.map((item) => item.name)).toEqual(["Sales", "Summary Q4"]);
    expect(next.activeSheetId).toBe("sales");
    expect(next.cellBgColor?.[0][0]).toBe("#112233");
    expect(next.sheets?.[1].data.formulas?.[0][0]).toBe("=Sales!C2");
    expect(restored.warnings.join(" ")).toMatch(/identity/);
    expect(() => readNativeBackup(new TextEncoder().encode('{"version":1,"blocks":{},"blockOrder":[]}'))).toThrow(/single-spreadsheet/);
    source.blocks.other = { type: "table" };
    expect(() => readNativeBackup(new TextEncoder().encode(JSON.stringify(source)))).toThrow(/single-spreadsheet/);
  });
  it("normalizes real dates from a 1904 workbook to 1900 serials without timezone shifts", async () => {
    const wb = new ExcelJS.Workbook(); wb.properties.date1904 = true;
    const ws = wb.addWorksheet("Dates"); ws.getCell("A1").value = new Date("2026-10-19T00:00:00Z"); ws.getCell("A1").numFmt = "yyyy-mm-dd";
    const parsed = await importXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
    const copy = new ExcelJS.Workbook(); await copy.xlsx.load((await exportXlsx(parsed.sheets, parsed.activeSheetId)).bytes as never);
    expect(copy.worksheets[0].getCell("A1").value).toEqual(new Date("2026-10-19T00:00:00Z"));
  });
  it("does not interpret formula-looking imported CSV text", async () => {
    const data = readCsv('A,B\r\n"=1+1","00123"');
    expect(data.cells[1]).toEqual(["=1+1", "00123"]); expect(data.formulas).toBeUndefined();
    const wb = new ExcelJS.Workbook(); const bytes = (await exportXlsx([{ id: "csv", name: "CSV", data }], "csv")).bytes;
    await wb.xlsx.load(bytes as never);
    expect(wb.worksheets[0].getCell("A2").value).toBe("=1+1");
    expect(wb.worksheets[0].getCell("B2").value).toBe("00123");
  });
  it("preserves quoted newlines, blank interior records, BOM and commas", () => {
    expect(readCsv('\uFEFFA,B\r\n"one,two","line1\nline2"\r\n\r\n"say ""hi""",last\r\n').cells)
      .toEqual([["A", "B"], ["one,two", "line1\nline2"], ["", ""], ['say "hi"', "last"]]);
    expect(readCsv("a\tb\n1\t2", "\t").cells[1]).toEqual(["1", "2"]);
    expect(() => readCsv('"not closed')).toThrow(); expect(() => readCsv('"a"bad')).toThrow();
  });
  it("neutralizes CSV formula injection by default", () => {
    const csv = writeCsv({ rows: 1, cols: 5, cells: [["=1+1", "\t@SUM(A1)", "+2", "-3", "normal"]] });
    expect(csv).toContain('"\'=1+1"'); expect(csv).toContain('"\'\t@SUM(A1)"'); expect(csv).toContain('"normal"');
  });
  it("bounds CSV export output bytes before constructing an oversized file", () => {
    const cells = Array.from({ length: 400 }, () => ["x".repeat(32767)]);
    expect(() => writeCsv({ rows: 400, cols: 1, cells })).toThrow(/10 MiB/);
  });
  it("rejects unsafe archives before workbook parsing", async () => {
    await expect(inspectXlsx(new Uint8Array(25))).rejects.toThrow();
    const zip = new JSZip(); zip.file("[Content_Types].xml", "<a/>"); zip.file("xl/workbook.xml", "<a/>"); zip.file("xl/vbaProject.bin", "macro");
    await expect(inspectXlsx(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(/Macros/);
    zip.remove("xl/vbaProject.bin"); zip.file("../escape.xml", "x");
    await expect(inspectXlsx(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(/Unsafe/);
  });
  it("enforces names, dimensions, total cells and visible-sheet limits", () => {
    expect(() => assertDimensions(10001, 1)).toThrow(); expect(() => assertDimensions(1000, 256)).toThrow();
    const sheets = fixture(); sheets[1].name = "sales"; expect(() => assertWorkbook(sheets)).toThrow(/duplicate/);
    const hidden = fixture().map((s) => ({ ...s, data: { ...s.data, sheetHidden: true } })); expect(() => assertWorkbook(hidden)).toThrow(/visible/);
    expect(address(9, 27)).toBe("AB10"); expect(parseRange("$B$2:C3")).toEqual({ row: [1, 2], column: [1, 2] });
  });
  it.each(["=WEBSERVICE(A1)", "='[Other.xlsx]Sheet1'!A1", "=RTD(A1)", "=cmd|' /C whoami'!A0"])("rejects active/external formula %s", (formula) => {
    expect(() => assertFormula(formula)).toThrow();
  });
  it("allows ordinary formulas and safe links, not dangerous schemes", () => {
    expect(() => assertFormula('=IF(A1="[text]",SUM(B1:B5),0)')).not.toThrow();
    expect(safeLink("https://example.com/path")).toBe(true); expect(safeLink("javascript:alert(1)")).toBe(false); expect(safeLink("file:///etc/passwd")).toBe(false);
  });
});
