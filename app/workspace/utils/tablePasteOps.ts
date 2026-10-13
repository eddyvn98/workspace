import { normalizeTableData, type TableBlockData } from "./tableData";
import { textTableCellContent } from "../components/table/tableCellContent";
import { normalizeFormulaGrid } from "./tableFormula";

/** Splits clipboard text the way Excel/Sheets/Miro emit it when you copy a
 *  cell range: TSV rows (tab between columns, newline between rows). A plain
 *  single-cell copy round-trips as a 1x1 grid, so callers can always run
 *  paste through here instead of branching on "was this a range". */
export function parseClipboardGrid(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = normalized.split("\n");
  if (rows.length > 1 && rows[rows.length - 1] === "") rows.pop();
  return rows.map((row) => row.split("\t"));
}

/** Pastes a TSV-shaped grid into the table starting at (startRow, startCol),
 *  growing rows/cols as needed. Growth is a plain array extend (append-only,
 *  past every existing row/col) so it never has to shift or split an
 *  existing merge the way insertTableRow/Col would. */
export function pasteRangeIntoTable(
  data: Partial<TableBlockData> | undefined,
  startRow: number,
  startCol: number,
  grid: string[][]
): TableBlockData {
  const norm = normalizeTableData(data);
  const neededRows = Math.max(norm.rows, startRow + grid.length);
  const neededCols = Math.max(norm.cols, startCol + Math.max(1, ...grid.map((r) => r.length)));

  const cells: string[][] = Array.from({ length: neededRows }, (_, r) =>
    Array.from({ length: neededCols }, (_, c) => norm.cells[r]?.[c] ?? "")
  );
  const cellContents = Array.from({ length: neededRows }, (_, r) =>
    Array.from({ length: neededCols }, (_, c) => norm.cellContents?.[r]?.[c] ?? textTableCellContent(cells[r][c]))
  );
  const formulas = norm.mode === "spreadsheet" || norm.formulas
    ? normalizeFormulaGrid(norm.formulas, neededRows, neededCols)
    : undefined;

  grid.forEach((row, rOffset) => {
    row.forEach((value, cOffset) => {
      const r = startRow + rOffset;
      const c = startCol + cOffset;
      const isFormula = norm.mode === "spreadsheet" && value.trimStart().startsWith("=");
      cells[r][c] = isFormula ? "" : value;
      if (formulas) formulas[r][c] = isFormula ? value : undefined;
      cellContents[r][c] = textTableCellContent(value);
    });
  });

  return {
    ...norm,
    rows: neededRows,
    cols: neededCols,
    cells,
    cellContents,
    ...(formulas?.some((row) => row.some(Boolean)) ? { formulas } : {}),
    ...(norm.rowWeights ? { rowWeights: [...norm.rowWeights, ...Array(neededRows - norm.rows).fill(1)] } : {}),
    ...(norm.colWeights ? { colWeights: [...norm.colWeights, ...Array(neededCols - norm.cols).fill(1)] } : {}),
  } as TableBlockData;
}
