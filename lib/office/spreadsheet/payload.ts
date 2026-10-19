import type { TableBlockPayload } from "@/app/workspace/types/table";
import type { WorkbookImport } from "./xlsx";
export function importedPayload(value: WorkbookImport): TableBlockPayload {
  const active = value.sheets.find((s) => s.id === value.activeSheetId) ?? value.sheets[0];
  if (!active) throw new Error("Workbook has no sheets.");
  return { ...active.data, sheets: value.sheets, activeSheetId: active.id };
}
/** The caller may shallow-merge patches. Explicitly clear old metadata instead
 * of leaving links/validations/attachments from the replaced workbook behind. */
export function replacementPatch(previous: TableBlockPayload, next: TableBlockPayload): Partial<TableBlockPayload> {
  return { ...Object.fromEntries(Object.keys(previous).map((key) => [key, undefined])), ...next };
}
