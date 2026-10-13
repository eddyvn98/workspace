type Action = Record<string, unknown>;

export function validateTableSurfaceAction(action: Action): string | null {
  const type = action.type;
  if (type === "update_table_options" && action.headerRow === undefined && action.headerCol === undefined && action.mode === undefined) {
    return "update_table_options requires a header option or mode.";
  }
  if ((type === "duplicate_table_row" && action.row === undefined && action.index === undefined)
    || (type === "duplicate_table_column" && action.column === undefined && action.index === undefined)) {
    return `${type} requires a source row or column.`;
  }
  if (type === "paste_table_range" && typeof action.text !== "string" && !Array.isArray(action.values)) return "paste_table_range requires text or values.";
  if (type === "paste_table_range" && Array.isArray(action.values)) {
    const values = action.values as unknown[];
    const columns = Math.max(0, ...values.map((row) => Array.isArray(row) ? row.length : 1));
    if (values.length * columns > 20_000) return "paste_table_range exceeds the 20000-cell limit.";
  }
  if (type === "import_table" && ![action.text, action.content, action.data].some((value) => typeof value === "string")) {
    return "import_table requires text, content or data.";
  }
  if (type === "sort_table_range" && action.column === undefined && action.col === undefined) return "sort_table_range requires a column.";
  return null;
}
