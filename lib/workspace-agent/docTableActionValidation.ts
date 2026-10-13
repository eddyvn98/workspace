export function validateDocTableAction(action: Record<string, unknown>): string | null {
  if (action.type === "set_table_filter" && action.clear !== true && typeof action.range !== "string") return "set_table_filter requires an A1 range or clear:true.";
  return null;
}
