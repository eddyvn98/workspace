import type { TableWorkbookSheet } from "@/app/workspace/types/table";

/** Enforced import/export contract, measured over allocated rectangles. */
export const SHEET_LIMITS = Object.freeze({
  fileBytes: 10 * 1024 * 1024, expandedBytes: 50 * 1024 * 1024,
  zipEntries: 2048, sheets: 20, rows: 10_000, columns: 256, cells: 50_000,
  text: 32_767, formula: 8192, workerMs: 30_000,
});
export function assertDimensions(rows: number, cols: number): number {
  if (![rows, cols].every(Number.isSafeInteger) || rows < 1 || cols < 1 || rows > SHEET_LIMITS.rows
    || cols > SHEET_LIMITS.columns || rows * cols > SHEET_LIMITS.cells) {
    throw new Error("Supported limit: 10,000 rows, 256 columns and 50,000 cells across the workbook.");
  }
  return rows * cols;
}
export function assertCellText(text: string): void {
  if (text.length > SHEET_LIMITS.text) throw new Error("A cell exceeds 32,767 characters.");
}
export function assertFormula(formula: string): void {
  const expression = formula.replace(/"(?:[^"]|"")*"/g, '""');
  if (formula.length > SHEET_LIMITS.formula) throw new Error("A formula exceeds 8,192 characters.");
  if (/\[|\]|\||\b(?:WEBSERVICE|RTD|DDE|EXEC|CALL|REGISTER|IMPORTXML|IMPORTDATA|IMPORTHTML|HYPERLINK)\s*\(/i.test(expression)) {
    throw new Error("External-workbook, structured-reference and external-service formulas are not supported. Import a values-only copy.");
  }
}
export function safeLink(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url) && !/[\u0000-\u0020\u007f]/.test(url);
}
export function assertWorkbook(sheets: TableWorkbookSheet[]): void {
  if (!sheets.length || sheets.length > SHEET_LIMITS.sheets) throw new Error("A workbook must contain 1 to 20 sheets.");
  const ids = new Set<string>(), names = new Set<string>();
  let cells = 0;
  for (const sheet of sheets) {
    if (!sheet.id || ids.has(sheet.id) || !sheet.name.trim() || sheet.name.length > 31
      || /[\\/?*\[\]:]/.test(sheet.name) || names.has(sheet.name.toLowerCase())) throw new Error("Invalid or duplicate worksheet name/ID.");
    ids.add(sheet.id); names.add(sheet.name.toLowerCase());
    cells += assertDimensions(sheet.data.rows, sheet.data.cols);
    if (cells > SHEET_LIMITS.cells) throw new Error("Workbook exceeds 50,000 allocated cells across all sheets.");
    for (let r = 0; r < sheet.data.rows; r++) for (let c = 0; c < sheet.data.cols; c++) {
      assertCellText(String(sheet.data.cells[r]?.[c] ?? ""));
      const formula = sheet.data.formulas?.[r]?.[c];
      if (formula) assertFormula(formula);
    }
  }
  if (sheets.every((sheet) => sheet.data.sheetHidden)) throw new Error("At least one worksheet must remain visible.");
}
