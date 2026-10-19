import type { Range } from "@fortune-sheet/core";
import type { TableBlockPayload } from "../../types/table";

/** Every persisted field matters: notes, borders, validation, freeze and strike
 * changes must not disappear simply because the visible cell text is unchanged. */
export function tableDataSignature(data: Partial<TableBlockPayload>): string {
  return JSON.stringify(data, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
}

export function isSpreadsheetControl(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".fortune-toolbar, [class*='fortune-menu'], [class*='fortune-dropdown']"));
}

export function createSelectionRange(range: Range[number]): Range[number] {
  let row = [...range.row];
  let column = [...range.column];
  let rowFocus: number | undefined = row[0];
  let columnFocus: number | undefined = column[0];
  let left = 0;
  let width = 0;
  let top = 0;
  let height = 0;
  let leftMove = 0;
  let widthMove = 0;
  let topMove = 0;
  let heightMove = 0;
  const stableRange = {} as Range[number] & Record<string, number | number[] | undefined>;
  Object.defineProperties(stableRange, {
    row: { enumerable: true, get: () => row, set: (value: number[]) => { row = value; } },
    column: { enumerable: true, get: () => column, set: (value: number[]) => { column = value; } },
    row_focus: { enumerable: true, get: () => rowFocus, set: (value: number) => { rowFocus = value; } },
    column_focus: { enumerable: true, get: () => columnFocus, set: (value: number) => { columnFocus = value; } },
    left: { enumerable: true, get: () => left, set: (value: number) => { left = value; } },
    width: { enumerable: true, get: () => width, set: (value: number) => { width = value; } },
    top: { enumerable: true, get: () => top, set: (value: number) => { top = value; } },
    height: { enumerable: true, get: () => height, set: (value: number) => { height = value; } },
    left_move: { enumerable: true, get: () => leftMove, set: (value: number) => { leftMove = value; } },
    width_move: { enumerable: true, get: () => widthMove, set: (value: number) => { widthMove = value; } },
    top_move: { enumerable: true, get: () => topMove, set: (value: number) => { topMove = value; } },
    height_move: { enumerable: true, get: () => heightMove, set: (value: number) => { heightMove = value; } },
  });
  return stableRange;
}
