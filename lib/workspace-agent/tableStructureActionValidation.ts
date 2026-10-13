type Action = Record<string, unknown>;

export function validateTableStructureAction(action: Action): string | null {
  const type = action.type;
  if (type === "hide_table_rows" || type === "hide_table_columns") {
    if (typeof action.range !== "string" && !Array.isArray(action.indices)) return `${type} requires a range or indices.`;
  }
  if (type === "set_table_validation" && action.clear !== true
    && (!Array.isArray(action.values) || action.values.length === 0)) return "set_table_validation requires values or clear true.";
  if (type === "add_table_conditional_format" && action.clear !== true) {
    const rule = action.rule;
    const values = Array.isArray(action.values) ? action.values : [];
    if (typeof rule !== "string") return "add_table_conditional_format requires a rule or clear true.";
    if (rule === "between" && !(action.value1 !== undefined && action.value2 !== undefined) && values.length < 2) {
      return "add_table_conditional_format between requires two values.";
    }
    if (["gt", "lt", "equal", "text_contains"].includes(String(rule))
      && action.value === undefined && action.value1 === undefined && values.length === 0) {
      return "add_table_conditional_format requires a comparison value.";
    }
  }
  if (type === "set_table_link" && action.clear !== true && typeof action.url !== "string") return "set_table_link requires a URL or clear true.";
  if (type === "set_table_note" && action.clear !== true && typeof action.text !== "string") return "set_table_note requires text or clear true.";
  if (type === "set_table_sheet_options" && action.color === undefined && action.hidden === undefined) return "set_table_sheet_options requires color or hidden.";
  return null;
}
