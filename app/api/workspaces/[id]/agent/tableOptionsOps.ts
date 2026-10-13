import { evaluateTableFormulas } from "@/app/workspace/utils/tableFormula";
import type { TableBlockPayload } from "@/app/workspace/types/table";
import { retextCellContent } from "./tableCellEdit";
import { addNote, field, formulaOptions, isFormula } from "./tableOpsShared";
import type { JsonMap } from "./operationsTables";

function flag(raw: JsonMap, key: string): boolean | undefined {
  const input = field(raw, key);
  if (typeof input === "boolean") return input;
  return input === "true" ? true : input === "false" ? false : undefined;
}

/** Going to document mode: formulas stay in the data, but the cells show the
 * values they evaluate to (the document renderer ignores `formulas`). */
function materializeFormulaValues(raw: JsonMap, data: JsonMap): number {
  if (!Array.isArray(data.formulas)) return 0;
  const evaluated = evaluateTableFormulas({ ...data, mode: "spreadsheet" } as Partial<TableBlockPayload>, formulaOptions(raw, data));
  const cells = (data.cells as string[][]).map((row) => [...row]);
  let count = 0;
  (data.formulas as unknown[][]).forEach((row, rowIndex) => (Array.isArray(row) ? row : []).forEach((formula, columnIndex) => {
    if (!isFormula(formula) || cells[rowIndex]?.[columnIndex] === undefined) return;
    cells[rowIndex][columnIndex] = evaluated.values[rowIndex][columnIndex];
    count += 1;
  }));
  data.cells = cells;
  if (Array.isArray(data.cellContents)) {
    data.cellContents = (data.cellContents as unknown[][]).map((row, rowIndex) => (Array.isArray(row)
      ? row.map((cell, columnIndex) => (isFormula((data.formulas as unknown[][])[rowIndex]?.[columnIndex]) ? retextCellContent(cell, cells[rowIndex][columnIndex]) : cell)) : row));
  }
  return count;
}

/** update_table_options {headerRow?, headerCol?, mode?} */
export function applyTableOptions(raw: JsonMap, data: JsonMap): boolean {
  const headerRow = flag(raw, "headerRow");
  const headerCol = flag(raw, "headerCol");
  const mode = field(raw, "mode");
  if (mode !== undefined && mode !== "document" && mode !== "spreadsheet") return false;
  if (headerRow === undefined && headerCol === undefined && mode === undefined) return false;
  if (headerRow !== undefined) data.headerRow = headerRow;
  if (headerCol !== undefined) data.headerCol = headerCol;
  if (mode !== undefined && mode !== (data.mode === "spreadsheet" ? "spreadsheet" : "document")) {
    if (mode === "document") {
      const frozen = materializeFormulaValues(raw, data);
      addNote(raw, `Table switched to document mode: formulas are kept in the data but ${frozen} formula cell(s) now show their stored values and are no longer recalculated. Switch back with mode "spreadsheet".`);
    }
    data.mode = mode;
  }
  return true;
}
