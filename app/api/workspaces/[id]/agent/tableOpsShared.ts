import { workbookFormulaOptions, type TableFormulaOptions } from "@/app/workspace/utils/tableFormula";
import type { TableBlockPayload } from "@/app/workspace/types/table";
import type { JsonMap } from "./operationsTables";

export const rec = (input: unknown): JsonMap => (input && typeof input === "object" && !Array.isArray(input) ? input as JsonMap : {});

/** Reads a field from the action or its `params` object. */
export const field = (raw: JsonMap, key: string): unknown => raw[key] ?? rec(raw.params)[key];

export function intField(raw: JsonMap, key: string): number | undefined {
  const parsed = Number(field(raw, key));
  return field(raw, key) !== undefined && field(raw, key) !== null && field(raw, key) !== "" && Number.isInteger(parsed) ? parsed : undefined;
}

/** Collects human-readable receipt notes; the dispatcher seeds `__notes`. */
export function addNote(raw: JsonMap, note: string): void {
  if (Array.isArray(raw.__notes)) (raw.__notes as string[]).push(note);
}

/** Returns a rows x cols copy of a per-cell grid (missing entries are null). */
export function gridOf(source: unknown, rows: number, cols: number): unknown[][] {
  return Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, column) => (
    Array.isArray(source) && Array.isArray(source[row]) ? source[row][column] ?? null : null
  )));
}

/** Formula evaluation options that can resolve other sheets of the workbook. */
export function formulaOptions(raw: JsonMap, data: JsonMap): TableFormulaOptions {
  const sheets = raw.__sheets as Array<{ id: string; name: string; data: unknown }> | undefined;
  if (Array.isArray(sheets) && sheets.length > 1) {
    const name = String(raw.__formulaSheetName ?? "");
    return {
      sheetName: name,
      getSheet: (target) => {
        const sheet = sheets.find((item) => item.name.toLowerCase() === target.toLowerCase());
        return sheet ? (sheet.name.toLowerCase() === name.toLowerCase() ? data : sheet.data) as Partial<TableBlockPayload> : undefined;
      },
    };
  }
  return workbookFormulaOptions(data as Partial<TableBlockPayload>);
}

export const isFormula = (item: unknown): item is string => typeof item === "string" && item.trim().startsWith("=");

/** Drops JSON-unsafe `undefined` slots and an all-empty formula grid. */
export function cleanFormulas(formulas: unknown[][]): unknown[][] | undefined {
  return formulas.some((row) => row.some(Boolean)) ? formulas.map((row) => row.map((item) => item ?? null)) : undefined;
}
