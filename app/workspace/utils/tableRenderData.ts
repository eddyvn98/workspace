import type { CanvasBlock } from "../types/block";
import type { TableCellContent } from "../types/table";
import { isTableCellContent, textTableCellContent } from "../components/table/tableCellContent";
import { evaluateTableFormulas, normalizeFormulaGrid, tableMode, workbookFormulaOptions, type TableFormulaError } from "./tableFormula";
import { visibleRowIndices } from "./tableColumnTypes";
import { formatTableValue } from "./tableCellFormat";

function evaluatedCellContent(content: TableCellContent | undefined, value: string): TableCellContent {
  if (!isTableCellContent(content)) return textTableCellContent(value);
  const templateBlock = content.blocks.find((block) => block.runs.length) ?? content.blocks[0];
  const templateRun = templateBlock?.runs.find((run) => run.marks || run.fontSize) ?? templateBlock?.runs[0];
  const next = textTableCellContent(value);
  return {
    ...next,
    blocks: next.blocks.map((block, index) => ({
      ...block,
      align: content.blocks[index]?.align ?? templateBlock?.align,
      runs: [{
        text: block.runs[0]?.text ?? "",
        ...(templateRun?.marks ? { marks: { ...templateRun.marks } } : {}),
        ...(templateRun?.fontSize ? { fontSize: templateRun.fontSize } : {}),
      }],
    })),
  };
}

export interface TableRenderData {
  mode: "document" | "spreadsheet";
  rows: number;
  cols: number;
  rowWeights: number[];
  colWeights: number[];
  rowSum: number;
  colSum: number;
  grid: string[][];
  displayGrid: string[][];
  contentGrid: TableCellContent[][];
  formulaGrid: (string | undefined)[][];
  formulaErrors: (TableFormulaError | undefined)[][];
  rowOrder: number[];
  sortCol: CanvasBlock<"table">["data"]["sortCol"];
  filterCol: CanvasBlock<"table">["data"]["filterCol"];
}

export function buildTableRenderData(block: CanvasBlock<"table">): TableRenderData {
  const data = block.data;
  const rows = typeof data?.rows === "number" && data.rows > 0 ? data.rows : 2;
  const cols = typeof data?.cols === "number" && data.cols > 0 ? data.cols : 2;
  const rowWeights = Array.isArray(data?.rowWeights) && data.rowWeights.length === rows ? data.rowWeights : Array(rows).fill(1);
  const colWeights = Array.isArray(data?.colWeights) && data.colWeights.length === cols ? data.colWeights : Array(cols).fill(1);
  const grid = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => data?.cells?.[row]?.[col] ?? "")
  );
  const mode = tableMode(data);
  const formulaGrid = mode === "spreadsheet"
    ? normalizeFormulaGrid(data?.formulas, rows, cols)
    : Array.from({ length: rows }, () => Array<string | undefined>(cols).fill(undefined));
  const evaluated = mode === "spreadsheet" ? evaluateTableFormulas({ ...data, rows, cols, cells: grid, formulas: formulaGrid }, workbookFormulaOptions(data)) : { values: grid, errors: Array.from({ length: rows }, () => Array<TableFormulaError | undefined>(cols).fill(undefined)) };
  // Number/date formats (cellFormats / columnFormats `fa`) change what is shown, in both modes.
  const displayValues = evaluated.values.map((valueRow, row) => valueRow.map((text, col) => {
    const fa = data?.cellFormats?.[row]?.[col]?.fa ?? data?.columnFormats?.[col]?.fa;
    if (!fa) return text;
    const rawValue = formulaGrid[row][col] ? text : data?.cellValues?.[row]?.[col] ?? text;
    return formatTableValue(typeof rawValue === "number" ? rawValue : text, fa) ?? text;
  }));
  const contentGrid = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => formulaGrid[row][col] || displayValues[row][col] !== evaluated.values[row][col]
      ? evaluatedCellContent(data?.cellContents?.[row]?.[col], displayValues[row][col])
      : isTableCellContent(data?.cellContents?.[row]?.[col])
        ? data.cellContents[row][col]
        : textTableCellContent(grid[row][col]))
  );
  const headerRow = Boolean(data?.headerRow);
  const merges = data?.merges ?? [];
  const sortCol = merges.length === 0 ? data?.sortCol ?? null : null;
  const filterCol = merges.length === 0 ? data?.filterCol ?? null : null;
  const dataRowOffset = headerRow ? 1 : 0;
  const sortedFilteredData = visibleRowIndices(
    { rows: Math.max(0, rows - dataRowOffset), cells: evaluated.values.slice(dataRowOffset), columnTypes: data?.columnTypes },
    sortCol,
    filterCol
  ).map((index) => index + dataRowOffset);
  return {
    mode,
    rows,
    cols,
    rowWeights,
    colWeights,
    rowSum: rowWeights.reduce((sum, weight) => sum + weight, 0) || 1,
    colSum: colWeights.reduce((sum, weight) => sum + weight, 0) || 1,
    grid,
    displayGrid: displayValues,
    contentGrid,
    formulaGrid,
    formulaErrors: evaluated.errors,
    rowOrder: headerRow ? [0, ...sortedFilteredData] : sortedFilteredData,
    sortCol,
    filterCol,
  };
}
