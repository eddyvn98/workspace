type Action = Record<string, unknown>;

function record(value: unknown): Action | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Action : null;
}

export function validateTableWorkbookAction(action: Action): string | null {
  if (action.type !== "add_table_sheet" || action.data === undefined) return null;
  const data = record(action.data);
  if (!data) return "add_table_sheet.data must be an object.";
  const rows = Math.max(Number(data.rows) || 1, Array.isArray(data.cells) ? data.cells.length : 1);
  const cols = Math.max(Number(data.cols) || 1, ...(Array.isArray(data.cells) ? data.cells.map((row) => Array.isArray(row) ? row.length : 0) : [1]));
  if (rows * cols > 50_000) return "add_table_sheet.data exceeds the 50000-cell limit.";
  return null;
}
