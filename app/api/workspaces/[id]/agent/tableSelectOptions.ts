import { addNote, field, rec } from "./tableOpsShared";
import { retextCellContent } from "./tableCellEdit";
import { syncCellValues } from "./tableGridShift";
import type { JsonMap } from "./operationsTables";

type Option = { id: string; label: string; color: string };

const norm = (input: unknown) => String(input ?? "").trim().toLowerCase();

function findOption(options: Option[], key: unknown): Option | undefined {
  return options.find((option) => norm(option.id) === norm(key)) ?? options.find((option) => norm(option.label) === norm(key));
}

/** removeOptionId / renameOption for a select column. Cells that hold a removed
 * option id are cleared (or remapped with `replaceWithOption`). Returns
 * undefined when the request carries neither field, false when it is invalid. */
export function applySelectOptionEdits(raw: JsonMap, data: JsonMap, column: number): boolean | undefined {
  const removeKey = field(raw, "removeOptionId");
  const rename = rec(field(raw, "renameOption"));
  if (removeKey === undefined && !Object.keys(rename).length) return undefined;
  const store = rec(data.columnSelectOptions);
  const options = (Array.isArray(store[column]) ? store[column] as JsonMap[] : []).map((item) => ({ id: String(item.id), label: String(item.label ?? item.id), color: String(item.color ?? "#94a3b8") }));
  if (Object.keys(rename).length) {
    const target = findOption(options, rename.id);
    if (!target || typeof rename.label !== "string" || !rename.label.trim()) return false;
    target.label = rename.label.trim();
    addNote(raw, `Renamed select option "${target.id}" to "${target.label}"; cells keep the option id so no cell text changed.`);
  }
  if (removeKey !== undefined) {
    const removed = findOption(options, removeKey);
    if (!removed) return false;
    const replacement = field(raw, "replaceWithOption") !== undefined ? findOption(options.filter((option) => option.id !== removed.id), field(raw, "replaceWithOption")) : undefined;
    if (field(raw, "replaceWithOption") !== undefined && !replacement) return false;
    options.splice(options.indexOf(removed), 1);
    const cells = (data.cells as string[][]).map((row) => [...row]);
    const changed: Array<{ row: number; column: number; text: string }> = [];
    cells.forEach((row, rowIndex) => {
      if (row[column] === removed.id) { row[column] = replacement?.id ?? ""; changed.push({ row: rowIndex, column, text: row[column] }); }
    });
    data.cells = cells;
    syncCellValues(data, changed);
    if (Array.isArray(data.cellContents)) {
      data.cellContents = (data.cellContents as unknown[][]).map((row, rowIndex) => (Array.isArray(row)
        ? row.map((cell, columnIndex) => (columnIndex === column && cells[rowIndex]?.[column] !== undefined && changed.some((item) => item.row === rowIndex) ? retextCellContent(cell, cells[rowIndex][column]) : cell)) : row));
    }
    const filter = data.filterCol as JsonMap | null | undefined;
    if (filter && Number(filter.col) === column && filter.optionId === removed.id) data.filterCol = null;
    addNote(raw, `Removed select option "${removed.label}" (${removed.id}): ${changed.length} cell(s) ${replacement ? `remapped to "${replacement.label}"` : "cleared"}.`);
  }
  data.columnSelectOptions = { ...store, [column]: options };
  return true;
}
