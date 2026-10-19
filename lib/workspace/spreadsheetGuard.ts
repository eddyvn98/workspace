/** Whole-block Yjs snapshots cannot safely merge concurrent workbook edits.
 * Spreadsheet boards use the existing REST compare-and-swap/conflict path. */
export function hasSpreadsheetBlock(blocks: unknown): boolean {
  if (!blocks || typeof blocks !== "object") return false;
  return Object.values(blocks).some((value: unknown) => {
    if (!value || typeof value !== "object" || !("type" in value) || value.type !== "table" || !("data" in value)) return false;
    const data = value.data;
    return Boolean(data && typeof data === "object" && (("mode" in data && data.mode === "spreadsheet") || ("sheets" in data && Array.isArray(data.sheets))));
  });
}
