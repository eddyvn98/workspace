import { normalizeTable, type JsonMap } from "./operationsTables";
import { applyRangeMerge, parseTableFormatRange, positionsInRange } from "./tableFormatRange";
import { applyTableAutoFit } from "./tableAutoFitOperations";
import { withTableCellMarks } from "./tableCellMarks";
import { applyTableDimensions } from "./tableDimensions";
import { applySelectOptionEdits } from "./tableSelectOptions";
import { applyFormulaAction } from "./tableFormulaBatch";
import { applySheetCellStyle } from "./tableSheetStyleOperations";
import { addNote } from "./tableOpsShared";

function record(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function value(raw: JsonMap, key: string): unknown {
  return raw[key] ?? record(raw.params)[key];
}

function integer(raw: JsonMap, key: string): number | undefined {
  const parsed = Number(value(raw, key));
  return Number.isInteger(parsed) ? parsed : undefined;
}

function grid(source: unknown, rows: number, cols: number): unknown[][] {
  return Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, column) => (
    Array.isArray(source) && Array.isArray(source[row]) ? source[row][column] ?? null : null
  )));
}

function cellPosition(raw: JsonMap, rows: number, cols: number): { row: number; column: number } | undefined {
  const cell = record(value(raw, "cell"));
  const row = integer(raw, "row") ?? integer(raw, "rowIndex") ?? integer(cell, "row");
  const column = integer(raw, "column") ?? integer(raw, "columnIndex") ?? integer(raw, "col") ?? integer(cell, "column");
  return row !== undefined && column !== undefined && row >= 0 && column >= 0 && row < rows && column < cols
    ? { row, column }
    : undefined;
}

// A format request may name one cell, a whole row ("header" = row 0) or a
// whole column; expand it to every cell it covers.
function formatPositions(raw: JsonMap, rows: number, cols: number): Array<{ row: number; column: number }> {
  const range = value(raw, "range");
  if (range !== undefined) {
    const parsed = parseTableFormatRange(range, rows, cols);
    return parsed ? positionsInRange(parsed) : [];
  }
  const single = cellPosition(raw, rows, cols);
  if (single) return [single];
  const scope = String(value(raw, "scope") ?? "").toLowerCase();
  const row = integer(raw, "row") ?? integer(raw, "rowIndex") ?? (scope === "header" || value(raw, "header") === true ? 0 : undefined);
  const column = integer(raw, "column") ?? integer(raw, "columnIndex") ?? integer(raw, "col");
  const rowList = row !== undefined ? (row >= 0 && row < rows ? [row] : []) : column !== undefined || scope === "table" ? Array.from({ length: rows }, (_, index) => index) : [];
  const columnList = column !== undefined ? (column >= 0 && column < cols ? [column] : []) : rowList.length ? Array.from({ length: cols }, (_, index) => index) : [];
  return rowList.flatMap((r) => columnList.map((c) => ({ row: r, column: c })));
}

function tableData(block: JsonMap): JsonMap {
  return normalizeTable(record(block.data));
}

function applyCellFormat(raw: JsonMap, data: JsonMap, block: JsonMap): boolean {
  const positions = formatPositions(raw, Number(data.rows), Number(data.cols));
  if (!positions.length) return false;
  const format = record(value(raw, "format"));
  const merge = value(raw, "merge") ?? format.merge;
  const range = merge === undefined ? null : parseTableFormatRange(value(raw, "range"), Number(data.rows), Number(data.cols));
  if (merge !== undefined && (typeof merge !== "boolean" || !range || !applyRangeMerge(data, range, merge))) return false;
  const fontSizeInput = value(raw, "fontSize") ?? format.fontSize;
  const align = value(raw, "align") ?? format.align;
  const backgroundColor = value(raw, "backgroundColor") ?? value(raw, "bgColor") ?? format.backgroundColor;
  const textColor = value(raw, "textColor") ?? format.textColor;
  const marks = Object.fromEntries(["bold", "italic", "underline"]
    .map((key) => [key, value(raw, key) ?? format[key]])
    .filter(([, mark]) => typeof mark === "boolean"));
  const numberFormat = typeof format.fa === "string" && format.fa.trim() ? format.fa : undefined;
  const rowHeightInput = value(raw, "rowHeight") ?? format.rowHeight;
  const columnWidthInput = value(raw, "columnWidth") ?? format.columnWidth;
  const sizeInputs = [fontSizeInput, rowHeightInput, columnWidthInput];
  if (sizeInputs.some((size) => size !== undefined && (!Number.isFinite(Number(size)) || Number(size) <= 0))) return false;
  const clampSize = (size: unknown, low: number, high: number): unknown => {
    if (size === undefined) return size;
    const clamped = Math.min(high, Math.max(low, Number(size)));
    if (clamped !== Number(size)) addNote(raw, `A size of ${Number(size)} was clamped to ${clamped} (allowed ${low}-${high}).`);
    return clamped;
  };
  const fontSize = clampSize(fontSizeInput, 1, 400);
  const rowHeight = clampSize(rowHeightInput, 4, 2000);
  const columnWidth = clampSize(columnWidthInput, 4, 2000);
  if (rowHeight !== undefined || columnWidth !== undefined) {
    const sizes = (size: unknown, axis: "row" | "column") => new Map(size === undefined ? [] : [...new Set(positions.map((position) => position[axis]))].map((index) => [index, Number(size)] as [number, number]));
    applyTableDimensions(block, data, sizes(rowHeight, "row"), sizes(columnWidth, "column"));
  }
  const grids = new Map<string, unknown[][]>();
  const values = (field: string) => {
    if (!grids.has(field)) { const next = grid(data[field], Number(data.rows), Number(data.cols)); grids.set(field, next); data[field] = next; }
    return grids.get(field)!;
  };
  const setValue = (field: string, row: number, column: number, next: unknown) => { values(field)[row][column] = next; };
  for (const position of positions) {
    if (fontSize !== undefined) setValue("cellFontSizes", position.row, position.column, Number(fontSize));
    if (["left", "center", "right"].includes(String(align))) setValue("cellAlign", position.row, position.column, align);
    if (backgroundColor !== undefined) setValue("cellBgColor", position.row, position.column, String(backgroundColor));
    if (textColor !== undefined) setValue("cellTextColor", position.row, position.column, String(textColor));
    if (Object.keys(marks).length) {
      const contents = values("cellContents");
      contents[position.row][position.column] = withTableCellMarks(
        contents[position.row][position.column], String((data.cells as string[][])[position.row][position.column]), marks,
      );
      data.cellContents = contents;
    }
    if (numberFormat) setValue("cellFormats", position.row, position.column, {
      ...record((data.cellFormats as unknown[][] | undefined)?.[position.row]?.[position.column]),
      fa: numberFormat, ...(typeof format.t === "string" ? { t: format.t } : {}),
    });
  }
  return applySheetCellStyle(raw, data, positions, format) || fontSize !== undefined || align !== undefined || backgroundColor !== undefined || textColor !== undefined || Object.keys(marks).length > 0 || numberFormat !== undefined || merge !== undefined || rowHeight !== undefined || columnWidth !== undefined;
}

function applyColumn(raw: JsonMap, data: JsonMap): boolean {
  const column = integer(raw, "column") ?? integer(raw, "columnIndex") ?? integer(raw, "col");
  if (column === undefined || column < 0 || column >= Number(data.cols)) return false;
  const type = value(raw, "columnType") ?? value(raw, "type");
  const allowedTypes = ["text", "person", "date", "number", "select"];
  if (typeof type === "string" && allowedTypes.includes(type)) {
    const existing = Array.isArray(data.columnTypes) ? data.columnTypes : [];
    const types = Array.from({ length: Number(data.cols) }, (_, index) => existing[index] ?? null);
    types[column] = type;
    data.columnTypes = types;
  }
  const options = value(raw, "options");
  if (Array.isArray(options)) {
    data.columnSelectOptions = {
      ...record(data.columnSelectOptions),
      [column]: options.map((item) => {
        const option = record(item);
        const id = String(option.id ?? option.label ?? "").trim();
        return { id, label: String(option.label ?? id), color: String(option.color ?? "#64748b") };
      }).filter((option) => option.id),
    };
  }
  const option = record(value(raw, "option"));
  if (Object.keys(option).length) {
    const existing = Array.isArray(record(data.columnSelectOptions)[column]) ? [...record(data.columnSelectOptions)[column] as unknown[]] : [];
    const id = String(option.id ?? crypto.randomUUID());
    data.columnSelectOptions = { ...record(data.columnSelectOptions), [column]: [...existing.filter((item) => String(record(item).id) !== id), { id, label: String(option.label ?? id), color: String(option.color ?? "#94a3b8") }] };
  }
  const optionEdit = applySelectOptionEdits(raw, data, column);
  if (optionEdit === false) return false;
  const columnOptions = Array.isArray(record(data.columnSelectOptions)[column])
    ? record(data.columnSelectOptions)[column] as unknown[] : [];
  if (type === "select" || (Array.isArray(data.columnTypes) && data.columnTypes[column] === "select")) {
    data.cells = (data.cells as string[][]).map((row) => {
      const cell = row[column];
      const match = columnOptions.map(record).find((candidate) => (
        String(candidate.id ?? "").toLowerCase() === String(cell ?? "").trim().toLowerCase()
        || String(candidate.label ?? "").trim().toLowerCase() === String(cell ?? "").trim().toLowerCase()
      ));
      return row.map((current, index) => index === column && match ? String(match.id) : current);
    });
  }
  const sort = value(raw, "sortDirection") ?? value(raw, "sort");
  if (sort === null || sort === "none" || sort === "") data.sortCol = null;
  else if (sort === "asc" || sort === "desc") data.sortCol = { col: column, dir: sort };
  const filter = value(raw, "filterOptionId") ?? value(raw, "filter");
  if (filter === null || filter === "none" || filter === "") data.filterCol = null;
  else if (typeof filter === "string") {
    const option = columnOptions.map(record).find((candidate) => (
      String(candidate.id ?? "").toLowerCase() === filter.trim().toLowerCase()
      || String(candidate.label ?? "").trim().toLowerCase() === filter.trim().toLowerCase()
    ));
    data.filterCol = { col: column, optionId: option ? String(option.id) : filter };
  }
  return optionEdit === true || type !== undefined || options !== undefined || Object.keys(option).length > 0 || sort !== undefined || filter !== undefined;
}

export function applyAdvancedTableAction(raw: JsonMap, block: JsonMap, type: string): boolean {
  const data = tableData(block);
  let changed = false;
  if (type === "update_table_cell_format") changed = applyCellFormat(raw, data, block);
  if (type === "update_table_column") changed = applyColumn(raw, data);
  if (type === "update_table_formula") changed = applyFormulaAction(raw, data);
  if (changed) {
    block.data = applyTableAutoFit(block, data);
    block.updatedAt = Date.now();
  }
  return changed;
}
