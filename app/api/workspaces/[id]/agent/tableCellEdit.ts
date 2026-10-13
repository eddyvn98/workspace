import { isTableCellContent, tableCellContentToPlainText, textTableCellContent } from "@/app/workspace/components/table/tableCellContent";
import { evaluateTableFormulas } from "@/app/workspace/utils/tableFormula";
import type { TableBlockPayload, TableCellContent } from "@/app/workspace/types/table";
import { syncCellValues } from "./tableGridShift";
import { storeNumericValues } from "./tableSheetNumberFormat";
import { addNote, cleanFormulas, formulaOptions, gridOf, isFormula, rec } from "./tableOpsShared";
import type { JsonMap } from "./operationsTables";

export type CellUpdate = { row: number; column: number; text: string; formula?: string };

/** Maps a select option label to its id so models can write labels. */
export function selectValue(data: JsonMap, column: number, text: string): string {
  const types = Array.isArray(data.columnTypes) ? data.columnTypes : [];
  if (types[column] !== "select") return text;
  const options = Array.isArray(rec(data.columnSelectOptions)[column]) ? rec(data.columnSelectOptions)[column] as unknown[] : [];
  const match = options.map(rec).find((option) => (
    String(option.id ?? "").toLowerCase() === text.trim().toLowerCase()
    || String(option.label ?? "").trim().toLowerCase() === text.trim().toLowerCase()
  ));
  return match ? String(match.id) : text;
}

/** New text for a cell that keeps the marks, font size and alignment of its
 * runs when they were uniform (the common "whole cell is bold" case). */
export function retextCellContent(existing: unknown, text: string): TableCellContent {
  if (!isTableCellContent(existing)) return textTableCellContent(text);
  if (tableCellContentToPlainText(existing) === text) return existing;
  const all = existing.blocks.flatMap((block) => block.runs);
  const runs = all.filter((run) => run.text !== "").length ? all.filter((run) => run.text !== "") : all;
  const signature = (run: (typeof runs)[number]) => JSON.stringify([run.marks ?? {}, run.fontSize ?? null]);
  if (!runs.length || !runs.every((run) => signature(run) === signature(runs[0]))) return textTableCellContent(text);
  const { marks, fontSize } = runs[0];
  return {
    version: 1,
    blocks: text.split("\n").map((line, index) => {
      const align = existing.blocks[index]?.align ?? existing.blocks[0]?.align;
      return { type: "paragraph" as const, ...(align ? { align } : {}), runs: [{ text: line, ...(marks ? { marks: { ...marks } } : {}), ...(fontSize ? { fontSize } : {}) }] };
    }),
  };
}

/** Applies cell edits to every grid. In spreadsheet mode a value that starts
 * with "=" becomes a formula (like the UI); an explicit `formula` also
 * switches a document table to spreadsheet mode. Returns null on a formula cycle. */
export function applyCellUpdates(raw: JsonMap, data: JsonMap, cells: string[][], updates: CellUpdate[]): JsonMap | null {
  const next: JsonMap = { ...data, cells };
  const rows = Number(data.rows);
  const cols = Number(data.cols);
  const resolved = updates.map((update) => {
    const explicit = isFormula(update.formula) ? update.formula.trim() : undefined;
    const typed = !explicit && data.mode === "spreadsheet" && isFormula(update.text) ? update.text.trim() : undefined;
    return { ...update, formula: explicit ?? typed, text: explicit ?? typed ? "" : update.text };
  });
  const hasFormula = resolved.some((update) => update.formula);
  if (hasFormula && data.mode !== "spreadsheet") {
    next.mode = "spreadsheet";
    addNote(raw, "The table was in document mode, so it was switched to spreadsheet mode to store the formula(s). Use update_table_options {mode:\"document\"} to switch back; formulas are kept and shown as their stored values.");
  }
  for (const update of resolved) cells[update.row][update.column] = update.text;
  syncCellValues(next, resolved);
  storeNumericValues(next, resolved.filter((update) => !update.formula));
  if (hasFormula || Array.isArray(data.formulas)) {
    const formulas = gridOf(data.formulas, rows, cols);
    for (const update of resolved) formulas[update.row][update.column] = update.formula ?? null;
    next.formulas = cleanFormulas(formulas);
  }
  if (hasFormula) {
    const result = evaluateTableFormulas({ ...next, mode: "spreadsheet" } as Partial<TableBlockPayload>, formulaOptions(raw, next));
    if (resolved.some((update) => update.formula && result.errors[update.row][update.column] === "#CYCLE!")) return null;
  }
  if (Array.isArray(data.cellContents)) {
    const touched = new Map(resolved.map((update) => [`${update.row}:${update.column}`, update.text]));
    next.cellContents = data.cellContents.map((row, rowIndex) => (Array.isArray(row)
      ? row.map((cell, columnIndex) => (touched.has(`${rowIndex}:${columnIndex}`) ? retextCellContent(cell, touched.get(`${rowIndex}:${columnIndex}`)!) : cell))
      : row));
  }
  return next;
}
