import { Parser } from "@fortune-sheet/formula-parser";

export type FormulaErrorCode = "#CYCLE!" | "#REF!" | "#VALUE!" | "#DIV/0!" | "#NAME?";

export class FormulaFailure extends Error {
  constructor(public readonly code: FormulaErrorCode) { super(code); }
}

export interface FormulaCellAccess {
  /** Returns the evaluated cell text, or throws FormulaFailure. Out-of-range cells yield undefined for ranges. */
  readCell(row: number, col: number, sheetName?: string, inRange?: boolean): string | undefined;
}

const ERROR_ALIASES: Record<string, FormulaErrorCode> = {
  "#DIV/0!": "#DIV/0!", "DIV/0": "#DIV/0!", "#NAME?": "#NAME?", "#REF!": "#REF!", "#VALUE!": "#VALUE!",
  "#CYCLE!": "#CYCLE!", "#ERROR!": "#VALUE!", "#N/A": "#VALUE!", "#NUM!": "#VALUE!", "#NULL!": "#VALUE!",
};

function toParserValue(text: string | undefined): unknown {
  if (text === undefined || !text.trim()) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : text;
}

function toCellText(value: unknown): string {
  const scalar = Array.isArray(value) ? (Array.isArray(value[0]) ? value[0][0] : value[0]) : value;
  if (scalar === null || scalar === undefined) return "";
  if (typeof scalar === "number") {
    if (!Number.isFinite(scalar)) throw new FormulaFailure("#VALUE!");
    return Number.isInteger(scalar) ? String(scalar) : String(Number(scalar.toFixed(10)));
  }
  if (typeof scalar === "boolean") return scalar ? "TRUE" : "FALSE";
  if (scalar instanceof Error) throw new FormulaFailure(ERROR_ALIASES[scalar.message] ?? "#VALUE!");
  if (typeof scalar === "string") {
    const alias = ERROR_ALIASES[scalar];
    if (alias) throw new FormulaFailure(alias);
    return scalar;
  }
  throw new FormulaFailure("#VALUE!");
}

/** Evaluates one spreadsheet expression (without the leading "=") with the full formula.js function set. */
export function evaluateFormulaExpression(expression: string, access: FormulaCellAccess): string {
  let pending: FormulaFailure | undefined;
  const guarded = (read: () => string | undefined): string | undefined => {
    try { return read(); } catch (error) {
      if (!(error instanceof FormulaFailure)) throw error;
      pending ??= error;
      return error.code;
    }
  };
  const parser = new Parser();
  parser.on("callCellValue", (cell, _options, done) => {
    done(toParserValue(guarded(() => access.readCell(cell.row.index, cell.column.index, cell.sheetName))));
  });
  parser.on("callRangeValue", (start, end, _options, done) => {
    const rows: unknown[][] = [];
    for (let row = start.row.index; row <= end.row.index; row++) {
      const values: unknown[] = [];
      for (let col = start.column.index; col <= end.column.index; col++) {
        values.push(toParserValue(guarded(() => access.readCell(row, col, start.sheetName, true))));
      }
      rows.push(values);
    }
    done(rows);
  });
  const parsed = parser.parse(expression);
  if (pending) throw pending;
  if (parsed.error) throw new FormulaFailure(ERROR_ALIASES[parsed.error] ?? "#VALUE!");
  return toCellText(parsed.result);
}
