import type { TableBlockPayload } from "@/app/workspace/types/table";
import { assertDimensions, assertCellText, SHEET_LIMITS } from "./limits";

/** RFC-4180 with bounded allocation; CSV never executes formulas on import. */
export function readCsv(text: string, delimiter: "," | "\t" = ","): TableBlockPayload {
  if (new TextEncoder().encode(text).length > SHEET_LIMITS.fileBytes) throw new Error("CSV exceeds 10 MiB.");
  text = text.replace(/^\uFEFF/, "");
  const cells: string[][] = [];
  let row: string[] = [], value = "", quoted = false, closed = false, cols = 1;
  const cell = () => { assertCellText(value); row.push(value); value = ""; closed = false;
    if (row.length > SHEET_LIMITS.columns) throw new Error("Too many CSV columns."); };
  const record = () => { cell(); cols = Math.max(cols, row.length); assertDimensions(cells.length + 1, cols); cells.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === delimiter) cell();
    else if (char === "\n" || char === "\r") { record(); if (char === "\r" && text[i + 1] === "\n") i++; }
    else if (char === '"' && !value && !closed) quoted = true;
    else { if (closed || char === '"') throw new Error("Malformed CSV quoting."); value += char; }
    if (value.length > SHEET_LIMITS.text) throw new Error("A CSV cell is too long.");
  }
  if (quoted) throw new Error("Unclosed CSV field.");
  if (value || row.length || closed || !cells.length) record();
  for (const line of cells) while (line.length < cols) line.push("");
  return { rows: cells.length, cols, cells, mode: "spreadsheet", columnFormats: Array.from({ length: cols }, () => ({ fa: "@", t: "s" })) };
}
export function writeCsv(data: TableBlockPayload): string {
  assertDimensions(data.rows, data.cols);
  const lines: string[] = [];
  const encoder = new TextEncoder();
  let byteSize = 3; // UTF-8 BOM
  for (let r = 0; r < data.rows; r++) {
    const fields: string[] = [];
    for (let c = 0; c < data.cols; c++) {
      let value = String(data.cells[r]?.[c] ?? "");
      assertCellText(value);
      // Includes leading whitespace/control-character tricks when opened by Excel.
      if (/^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)) value = "'" + value;
      const field = '"' + value.replace(/"/g, '""') + '"';
      byteSize += encoder.encode(field).length + (c === data.cols - 1 ? 2 : 1);
      if (byteSize > SHEET_LIMITS.fileBytes) throw new Error("CSV export exceeds 10 MiB.");
      fields.push(field);
    }
    lines.push(fields.join(","));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
