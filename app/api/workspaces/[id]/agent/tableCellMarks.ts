import { isTableCellContent, textTableCellContent } from "@/app/workspace/components/table/tableCellContent";
import type { TableCellMarks } from "@/app/workspace/types/table";

export function withTableCellMarks(existing: unknown, text: string, marks: TableCellMarks) {
  const content = isTableCellContent(existing) ? structuredClone(existing) : textTableCellContent(text);
  for (const block of content.blocks) {
    for (const run of block.runs) run.marks = { ...run.marks, ...marks };
  }
  return content;
}
