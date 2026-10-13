import { shiftTableAxis, syncCellValues } from "./tableGridShift";
import { applyCellUpdates, selectValue, type CellUpdate } from "./tableCellEdit";
import { applyTableAutoFit } from "./tableAutoFitOperations";

export type JsonMap = Record<string, unknown>;

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function value(raw: JsonMap, key: string): unknown {
  return raw[key] ?? record(raw.params)[key];
}

function integer(raw: JsonMap, key: string): number | undefined {
  const numberValue = Number(value(raw, key));
  return Number.isInteger(numberValue) ? numberValue : undefined;
}

function cellValue(raw: JsonMap): JsonMap {
  return record(value(raw, "cell"));
}

function integerFrom(raw: JsonMap, keys: string[], nestedKey: string): number | undefined {
  for (const key of keys) {
    const parsed = integer(raw, key);
    if (parsed !== undefined) return parsed;
  }
  const nested = Number(cellValue(raw)[nestedKey]);
  return Number.isInteger(nested) ? nested : undefined;
}

function cellText(raw: JsonMap): string | undefined {
  const direct = value(raw, "text") ?? value(raw, "value") ?? value(raw, "content");
  if (typeof direct === "string") return direct;
  const nested = cellValue(raw);
  if (typeof nested.text === "string") return nested.text;
  if (typeof nested.value === "string") return nested.value;
  if (typeof nested.content === "string") return nested.content;
  return Object.entries(raw).find(([key, candidate]) => key !== "type" && typeof candidate === "string" && !/id|target|mode|row|column/i.test(key))?.[1] as string | undefined;
}

function saveTable(block: JsonMap, data: JsonMap): void {
  block.data = applyTableAutoFit(block, data);
}

export function normalizeTable(data: JsonMap): JsonMap {
  const source = Array.isArray(data.cells) ? data.cells : [];
  const rows = Math.max(1, Math.trunc(Number(data.rows) || 1), source.length);
  const cols = Math.max(1, Math.trunc(Number(data.cols) || 1), source.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 1));
  return {
    ...data,
    rows,
    cols,
    cells: Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => String((source[row] as unknown[] | undefined)?.[col] ?? ""))),
  };
}

export function applyTableAction(
  raw: JsonMap,
  block: JsonMap,
  type: string,
): boolean {
  const data = normalizeTable(record(block.data));
  const cells = data.cells as string[][];
  const rowCount = Number(data.rows);
  const colCount = Number(data.cols);
  if (type === "update_table_cells") {
    const updates = value(raw, "cells");
    if (!Array.isArray(updates) || updates.length === 0 || updates.length > 400) return false;
    const parsed = updates.map((item) => {
      const update = record(item);
      const row = Number(update.row);
      const column = Number(update.column);
      const formula = typeof update.formula === "string" ? update.formula : undefined;
      const text = update.value ?? update.text ?? (formula !== undefined ? "" : undefined);
      return Number.isInteger(row) && Number.isInteger(column) && row >= 0 && row < rowCount
        && column >= 0 && column < colCount && typeof text === "string"
        && (formula === undefined || formula.trim().startsWith("="))
        ? { row, column, text, ...(formula !== undefined ? { formula } : {}) }
        : null;
    });
    if (parsed.some((item) => item === null)) return false;
    const coordinates = parsed.map((item) => `${item!.row}:${item!.column}`);
    if (new Set(coordinates).size !== coordinates.length) return false;
    const normalized: CellUpdate[] = (parsed as CellUpdate[]).map((update) => ({
      ...update,
      text: selectValue(data, update.column, update.text),
    }));
    const next = applyCellUpdates(raw, data, cells, normalized);
    if (!next) return false;
    saveTable(block, next);
    return true;
  }
  if (type === "update_table_cell") {
    const row = integerFrom(raw, ["row", "rowIndex"], "row") ?? 0;
    const column = integerFrom(raw, ["column", "columnIndex", "col"], "column") ?? 0;
    const text = cellText(raw);
    if (row === undefined || column === undefined || row < 0 || column < 0 || row >= rowCount || column >= colCount || typeof text !== "string") return false;
    const formula = value(raw, "formula");
    const next = applyCellUpdates(raw, data, cells, [{ row, column, text: selectValue(data, column, text), ...(typeof formula === "string" ? { formula } : {}) }]);
    if (!next) return false;
    saveTable(block, next);
    return true;
  }

  const listValues = (source: JsonMap, keys: string[]): string[] => {
    const found = keys.map((key) => value(source, key)).find((item) => Array.isArray(item));
    return Array.isArray(found) ? found.map((item) => (item === null || item === undefined ? "" : String(item))) : [];
  };
  const rowIndex = integer(raw, "row");
  const colIndex = integer(raw, "column");
  if (type === "insert_table_row") {
    const at = Math.max(0, Math.min(rowCount, rowIndex ?? rowCount));
    const filled = listValues(raw, ["values", "rowValues", "cells", "data"]);
    cells.splice(at, 0, Array.from({ length: data.cols as number }, (_, index) => filled[index] ?? ""));
    const grown: JsonMap = { ...data, rows: rowCount + 1, cells };
    shiftTableAxis(grown, "row", at, "insert", undefined, raw.__formulaSheetName as string | undefined);
    syncCellValues(grown, filled.map((text, column) => ({ row: at, column, text })).filter((item) => item.column < colCount));
    saveTable(block, grown);
    return true;
  }
  if (type === "insert_table_column") {
    const at = Math.max(0, Math.min(colCount, colIndex ?? colCount));
    const filled = listValues(raw, ["values", "columnValues", "cells", "data"]);
    cells.forEach((row, index) => row.splice(at, 0, filled[index] ?? ""));
    const widened: JsonMap = { ...data, cols: colCount + 1, cells };
    shiftTableAxis(widened, "col", at, "insert", undefined, raw.__formulaSheetName as string | undefined);
    syncCellValues(widened, filled.map((text, row) => ({ row, column: at, text })).filter((item) => item.row < rowCount));
    saveTable(block, widened);
    return true;
  }
  if (type === "delete_table_row" && rowCount > 1) {
    const removeAt = Math.max(0, Math.min(rowCount - 1, rowIndex ?? rowCount - 1));
    cells.splice(removeAt, 1);
    const shrunk: JsonMap = { ...data, rows: rowCount - 1, cells };
    shiftTableAxis(shrunk, "row", removeAt, "delete", undefined, raw.__formulaSheetName as string | undefined);
    saveTable(block, shrunk);
    return true;
  }
  if (type === "delete_table_column" && colCount > 1) {
    const at = Math.max(0, Math.min(colCount - 1, colIndex ?? colCount - 1));
    cells.forEach((row) => row.splice(at, 1));
    const narrowed: JsonMap = { ...data, cols: colCount - 1, cells };
    shiftTableAxis(narrowed, "col", at, "delete", undefined, raw.__formulaSheetName as string | undefined);
    saveTable(block, narrowed);
    return true;
  }
  return false;
}
