import type { BorderStyle, Borders, Cell, Worksheet } from "exceljs";
import type { TableBlockPayload, TableSheetRange } from "@/app/workspace/types/table";
import { colorFromExcel, colorToExcel, type Warnings } from "./xlsxStyles";
const STYLES: BorderStyle[] = ["thin", "hair", "dotted", "dashed", "dashDot", "dashDotDot", "double", "medium", "mediumDashed", "mediumDashDot", "mediumDashDotDot", "slantDashDot", "thick"];
const SIDES = { l: "left", r: "right", t: "top", b: "bottom" } as const;
type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
export function readBorder(cell: Cell, data: TableBlockPayload, r: number, c: number, warnings: Warnings): void {
  const value: Json = { row_index: r, col_index: c };
  for (const [short, long] of Object.entries(SIDES)) {
    const border = cell.border?.[long];
    if (border?.style) value[short] = { style: STYLES.indexOf(border.style) + 1 || 1, color: colorFromExcel(border.color, warnings) ?? "#000000" };
  }
  if (Object.keys(value).length > 2) (data.borderInfo ??= []).push({ rangeType: "cell", value });
  if (cell.border?.diagonal?.style) warnings.add("Diagonal borders are not preserved.");
}
function setBorder(cell: Cell, side: keyof typeof SIDES, spec: Json, warnings: Warnings): void {
  const style = STYLES[Number(spec.style ?? 1) - 1], next: Partial<Borders> = { ...cell.border };
  if (spec.clear) delete next[SIDES[side]];
  else if (style) next[SIDES[side]] = { style, color: colorToExcel(String(spec.color ?? "#000000"), warnings) };
  else warnings.add("An unsupported border style was omitted.");
  cell.border = next;
}
export function writeBorders(ws: Worksheet, data: TableBlockPayload, warnings: Warnings): void {
  let work = 0;
  for (const entry of data.borderInfo ?? []) {
    if (entry.rangeType === "cell") {
      const v = object(entry.value), row = Number(v.row_index), col = Number(v.col_index);
      if (![row, col].every(Number.isSafeInteger) || row < 0 || col < 0 || row >= data.rows || col >= data.cols) continue;
      for (const side of Object.keys(SIDES) as (keyof typeof SIDES)[]) if (v[side]) setBorder(ws.getCell(row + 1, col + 1), side, object(v[side]), warnings);
      continue;
    }
    if (entry.rangeType !== "range" || !Array.isArray(entry.range)) { warnings.add("An unsupported border entry was omitted."); continue; }
    const known = ["border-none", "border-all", "border-outside", "border-top", "border-bottom", "border-left", "border-right", "border-inside", "border-horizontal", "border-vertical"];
    if (!known.includes(String(entry.borderType))) { warnings.add("An unsupported border type was omitted."); continue; }
    for (const raw of entry.range) {
      const range = raw as TableSheetRange;
      if (!Array.isArray(range?.row) || !Array.isArray(range?.column)) throw new Error("Invalid border range.");
      const [r0, r1] = range.row, [c0, c1] = range.column;
      if (![r0, r1, c0, c1].every(Number.isSafeInteger) || r0 < 0 || c0 < 0 || r1 < r0 || c1 < c0 || r1 >= data.rows || c1 >= data.cols) throw new Error("Border exceeds worksheet bounds.");
      work += (r1 - r0 + 1) * (c1 - c0 + 1);
      if (work > 500_000) throw new Error("Too many overlapping border operations.");
      const type = entry.borderType;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const sides: (keyof typeof SIDES)[] = [];
        if (type === "border-none" || type === "border-all") sides.push("l", "r", "t", "b");
        else {
          if ((type === "border-outside" || type === "border-top") && r === r0) sides.push("t");
          if ((type === "border-outside" || type === "border-bottom") && r === r1) sides.push("b");
          if ((type === "border-outside" || type === "border-left") && c === c0) sides.push("l");
          if ((type === "border-outside" || type === "border-right") && c === c1) sides.push("r");
          if (type === "border-inside" || type === "border-horizontal") { if (r > r0) sides.push("t"); if (r < r1) sides.push("b"); }
          if (type === "border-inside" || type === "border-vertical") { if (c > c0) sides.push("l"); if (c < c1) sides.push("r"); }
        }
        for (const side of sides) setBorder(ws.getCell(r + 1, c + 1), side, { ...entry, clear: type === "border-none" }, warnings);
      }
    }
  }
}
