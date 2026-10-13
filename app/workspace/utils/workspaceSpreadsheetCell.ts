import type { Cell } from "@fortune-sheet/core";
import type { TableBlockPayload } from "../types/table";
import { decorateFortuneCell } from "./workspaceSpreadsheetStructure";

function normalizedFormula(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim().startsWith("=") ? value.trim() : `=${value.trim()}`;
}

export function cellFromTable(data: TableBlockPayload, row: number, col: number, sheetId = ""): Cell | null {
  const formula = normalizedFormula(data.formulas?.[row]?.[col]);
  const displayValue = data.cells?.[row]?.[col] ?? "";
  const value = data.cellValues?.[row]?.[col] ?? displayValue;
  const cell: Cell = formula ? { v: value, m: displayValue, f: formula } : { v: value, m: displayValue };
  const format = data.cellFormats?.[row]?.[col] ?? data.columnFormats?.[col];
  if (format?.fa) cell.ct = { fa: format.fa, ...(format.t ? { t: format.t } : {}) };
  const bg = data.cellBgColor?.[row]?.[col];
  const fc = data.cellTextColor?.[row]?.[col];
  const fs = data.cellFontSizes?.[row]?.[col];
  const ht = data.cellAlign?.[row]?.[col];
  const runs = data.cellContents?.[row]?.[col]?.blocks.flatMap((block) => block.runs) ?? [];
  if (bg) cell.bg = bg;
  if (fc) cell.fc = fc;
  if (fs) cell.fs = fs;
  if (ht) cell.ht = ht === "left" ? 1 : ht === "right" ? 2 : 0;
  if (runs.some((run) => run.marks?.bold)) cell.bl = 1;
  if (runs.some((run) => run.marks?.italic)) cell.it = 1;
  if (runs.some((run) => run.marks?.underline)) cell.un = 1;
  if (runs.some((run) => run.marks?.strikethrough)) cell.cl = 1;
  decorateFortuneCell(cell, data, row, col, sheetId);
  return cell;
}

