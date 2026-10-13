import type { TableMode } from "../types/table";
import { normalizeTableData, type TableBlockData } from "./tableData";
import { evaluateFormulaExpression, FormulaFailure, type FormulaErrorCode } from "./tableFormulaEngine";

export type TableFormulaError = FormulaErrorCode;
export type FormulaGrid = (string | undefined)[][];

const CELL_REFERENCE = /^\$?([A-Za-z]+)\$?(\d+)$/;
const CELL_REFERENCE_GLOBAL = /(\$?[A-Za-z]+\$?\d+)/g;

export function columnLabelToIndex(label: string): number {
  let result = 0;
  for (const char of label.toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64;
  return result - 1;
}

export function cellAddress(row: number, col: number): string {
  let value = col + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return `${label}${row + 1}`;
}

export function parseCellReference(value: string): { row: number; col: number } | null {
  const match = CELL_REFERENCE.exec(value.trim());
  if (!match) return null;
  const row = Number(match[2]) - 1;
  const col = columnLabelToIndex(match[1]);
  return row >= 0 && col >= 0 ? { row, col } : null;
}

export function normalizeFormulaGrid(formulas: FormulaGrid | undefined, rows: number, cols: number): FormulaGrid {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      const value = formulas?.[row]?.[col];
      return typeof value === "string" && value.trim().startsWith("=") ? value : undefined;
    })
  );
}

export interface EvaluatedTable {
  values: string[][];
  errors: (TableFormulaError | undefined)[][];
}

export interface TableFormulaOptions {
  /** Name of the sheet being evaluated; lets cross-sheet references resolve back to it. */
  sheetName?: string;
  /** Resolves another workbook sheet by name for references such as Sheet2!A1. */
  getSheet?: (name: string) => Partial<TableBlockData> | undefined;
  /** Sheets currently being evaluated, used to detect cross-sheet cycles. */
  stack?: string[];
}

/** Builds cross-sheet resolution options (Sheet2!A1) from a table's workbook sheets. */
export function workbookFormulaOptions(data: Partial<TableBlockData>): TableFormulaOptions {
  const sheets = data.sheets;
  if (!sheets?.length) return {};
  const active = sheets.find((sheet) => sheet.id === data.activeSheetId) ?? sheets[0];
  return {
    sheetName: active.name,
    getSheet: (name) => {
      const sheet = sheets.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
      return sheet ? (sheet.id === active.id ? data : sheet.data) : undefined;
    },
  };
}

const ERROR_CODES = new Set<string>(["#CYCLE!", "#REF!", "#VALUE!", "#DIV/0!", "#NAME?"]);

export function evaluateTableFormulas(data: Partial<TableBlockData>, options: TableFormulaOptions = {}): EvaluatedTable {
  const normalized = normalizeTableData(data);
  const formulas = normalizeFormulaGrid(normalized.formulas, normalized.rows, normalized.cols);
  const values = normalized.cells.map((row) => [...row]);
  const errors = Array.from({ length: normalized.rows }, () => Array<TableFormulaError | undefined>(normalized.cols).fill(undefined));
  const resolved = new Map<string, string>();
  const visiting = new Set<string>();
  const stack = [...(options.stack ?? []), (options.sheetName ?? "").toLowerCase()];
  const otherSheets = new Map<string, EvaluatedTable | undefined>();

  const readOtherSheet = (name: string): EvaluatedTable | undefined => {
    const key = name.toLowerCase();
    if (!otherSheets.has(key)) {
      const sheet = options.getSheet?.(name);
      if (sheet && stack.includes(key)) throw new FormulaFailure("#CYCLE!");
      otherSheets.set(key, sheet ? evaluateTableFormulas(sheet, { ...options, sheetName: name, stack }) : undefined);
    }
    return otherSheets.get(key);
  };

  const evaluateCell = (row: number, col: number): string => {
    if (row < 0 || col < 0 || row >= normalized.rows || col >= normalized.cols) throw new FormulaFailure("#REF!");
    const address = cellAddress(row, col);
    const cached = resolved.get(address);
    if (cached !== undefined) return cached;
    const formula = formulas[row][col];
    if (!formula) { resolved.set(address, values[row][col]); return values[row][col]; }
    if (visiting.has(address)) throw new FormulaFailure("#CYCLE!");
    visiting.add(address);
    try {
      if (formula.includes("#REF!")) throw new FormulaFailure("#REF!");
      const formatted = evaluateFormulaExpression(formula.slice(1), {
        readCell: (targetRow, targetCol, sheetName, inRange) => {
          let text: string;
          if (sheetName && sheetName.toLowerCase() !== (options.sheetName ?? "").toLowerCase()) {
            const other = readOtherSheet(sheetName);
            if (!other) throw new FormulaFailure("#REF!");
            if (targetRow >= other.values.length || targetCol >= (other.values[0]?.length ?? 0)) {
              if (inRange) return undefined;
              throw new FormulaFailure("#REF!");
            }
            const code = other.errors[targetRow]?.[targetCol];
            if (code) throw new FormulaFailure(code);
            return other.values[targetRow][targetCol];
          }
          if (inRange && (targetRow >= normalized.rows || targetCol >= normalized.cols)) return undefined;
          text = evaluateCell(targetRow, targetCol);
          if (ERROR_CODES.has(text)) throw new FormulaFailure(text as TableFormulaError);
          return text;
        },
      });
      resolved.set(address, formatted);
      return formatted;
    } catch (error) {
      const code = error instanceof FormulaFailure ? error.code : "#VALUE!";
      errors[row][col] = code;
      resolved.set(address, code);
      return code;
    } finally {
      visiting.delete(address);
    }
  };

  for (let row = 0; row < normalized.rows; row++) {
    for (let col = 0; col < normalized.cols; col++) {
      if (formulas[row][col]) values[row][col] = evaluateCell(row, col);
    }
  }
  return { values, errors };
}

function transformFormula(formula: string, transform: (position: { row: number; col: number }) => { row: number; col: number } | null): string {
  return formula.replace(CELL_REFERENCE_GLOBAL, (reference) => {
    const position = parseCellReference(reference);
    if (!position) return "#REF!";
    const next = transform(position);
    return next ? cellAddress(next.row, next.col) : "#REF!";
  });
}

export function shiftFormulasForRowInsert(formulas: FormulaGrid | undefined, index: number, rows: number, cols: number): FormulaGrid | undefined {
  if (!formulas) return undefined;
  const source = normalizeFormulaGrid(formulas, rows - 1, cols);
  const inserted = [...source.slice(0, index), Array<string | undefined>(cols).fill(undefined), ...source.slice(index)];
  return inserted.map((row) => row.map((formula) => formula ? transformFormula(formula, (p) => ({ row: p.row >= index ? p.row + 1 : p.row, col: p.col })) : undefined));
}

export function shiftFormulasForRowDelete(formulas: FormulaGrid | undefined, index: number, rows: number, cols: number): FormulaGrid | undefined {
  if (!formulas) return undefined;
  return normalizeFormulaGrid(formulas, rows, cols).filter((_, row) => row !== index).map((row) => row.map((formula) => formula ? transformFormula(formula, (p) => p.row === index ? null : { row: p.row > index ? p.row - 1 : p.row, col: p.col }) : undefined));
}

export function shiftFormulasForColInsert(formulas: FormulaGrid | undefined, index: number, rows: number, cols: number): FormulaGrid | undefined {
  if (!formulas) return undefined;
  const source = normalizeFormulaGrid(formulas, rows, cols - 1);
  return source.map((row) => {
    const inserted = [...row.slice(0, index), undefined, ...row.slice(index)];
    return inserted.map((formula) => formula ? transformFormula(formula, (p) => ({ row: p.row, col: p.col >= index ? p.col + 1 : p.col })) : undefined);
  });
}

export function shiftFormulasForColDelete(formulas: FormulaGrid | undefined, index: number, rows: number, cols: number): FormulaGrid | undefined {
  if (!formulas) return undefined;
  return normalizeFormulaGrid(formulas, rows, cols).map((row) => row.filter((_, col) => col !== index).map((formula) => formula ? transformFormula(formula, (p) => p.col === index ? null : { row: p.row, col: p.col > index ? p.col - 1 : p.col }) : undefined));
}

export function transformFormulaForCellMove(formula: string | undefined, rowDelta: number, colDelta: number): string | undefined {
  return formula ? transformFormula(formula, (p) => ({ row: p.row + rowDelta, col: p.col + colDelta })) : undefined;
}

export function tableMode(data: Partial<TableBlockData>): TableMode {
  return data.mode === "spreadsheet" ? "spreadsheet" : "document";
}
