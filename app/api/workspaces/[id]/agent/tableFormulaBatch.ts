import { evaluateTableFormulas } from "@/app/workspace/utils/tableFormula";
import type { TableBlockPayload } from "@/app/workspace/types/table";
import { parseTableFormatRange, positionsInRange } from "./tableFormatRange";
import { shiftRelativeRefs } from "./tableFormulaReferences";
import { addNote, field, formulaOptions, gridOf, intField, isFormula, rec } from "./tableOpsShared";
import type { JsonMap } from "./operationsTables";

type Target = { row: number; column: number; formula: string };

function targets(raw: JsonMap, rows: number, cols: number): Target[] | null {
  const formula = field(raw, "formula");
  const list = field(raw, "cells");
  if (Array.isArray(list)) {
    if (!list.length || list.length > 400) return null;
    const parsed = list.map((item) => {
      const entry = rec(item);
      const row = Number(entry.row);
      const column = Number(entry.column ?? entry.col);
      return Number.isInteger(row) && Number.isInteger(column) && row >= 0 && column >= 0 && row < rows && column < cols && isFormula(entry.formula)
        ? { row, column, formula: (entry.formula as string).trim() } : null;
    });
    return parsed.some((item) => item === null) ? null : parsed as Target[];
  }
  if (!isFormula(formula)) return null;
  const range = field(raw, "range");
  if (range !== undefined) {
    const parsed = parseTableFormatRange(range, rows, cols);
    if (!parsed) return null;
    const origin = { row: parsed.row[0], column: parsed.column[0] };
    return positionsInRange(parsed).map((position) => ({
      ...position,
      formula: shiftRelativeRefs(formula.trim(), position.row - origin.row, position.column - origin.column),
    }));
  }
  const row = intField(raw, "row") ?? intField(raw, "rowIndex") ?? Number(rec(field(raw, "cell")).row);
  const column = intField(raw, "column") ?? intField(raw, "columnIndex") ?? intField(raw, "col") ?? Number(rec(field(raw, "cell")).column);
  return Number.isInteger(row) && Number.isInteger(column) && row >= 0 && column >= 0 && row < rows && column < cols
    ? [{ row, column, formula: formula.trim() }] : null;
}

/** update_table_formula: one cell, `cells:[{row,column,formula}]`, or a fill
 * `{range, formula}` where the formula is written for the range's top-left
 * cell and relative references shift for the others. Rejects formula cycles. */
export function applyFormulaAction(raw: JsonMap, data: JsonMap): boolean {
  const rows = Number(data.rows);
  const cols = Number(data.cols);
  const found = targets(raw, rows, cols);
  if (!found || new Set(found.map((item) => `${item.row}:${item.column}`)).size !== found.length) return false;
  const formulas = gridOf(data.formulas, rows, cols);
  for (const item of found) formulas[item.row][item.column] = item.formula;
  const evaluated = evaluateTableFormulas({ ...data, formulas, mode: "spreadsheet" } as Partial<TableBlockPayload>, formulaOptions(raw, data));
  if (found.some((item) => evaluated.errors[item.row][item.column] === "#CYCLE!")) return false;
  data.formulas = formulas;
  if (data.mode !== "spreadsheet") {
    data.mode = "spreadsheet";
    addNote(raw, "The table was in document mode, so it was switched to spreadsheet mode to store the formula(s). Use update_table_options {mode:\"document\"} to switch back; formulas are kept and shown as their stored values.");
  }
  return true;
}
