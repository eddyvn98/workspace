import type { Cell, Color } from "exceljs";
import type { TableBlockPayload, TableCellMarks } from "@/app/workspace/types/table";
export type Warnings = Set<string>;
const THEMES = ["FFFFFF", "000000", "EEECE1", "1F497D", "4F81BD", "C0504D", "9BBB59", "8064A2", "4BACC6", "F79646", "0000FF", "800080"];
export function colorFromExcel(color: Partial<Color> | undefined, warnings: Warnings): string | undefined {
  if (!color) return undefined;
  if (color.argb && /^[\da-f]{6,8}$/i.test(color.argb)) return "#" + color.argb.slice(-6);
  if (typeof color.theme === "number") {
    warnings.add("Theme colors are flattened to the standard Office palette; custom themes and tints can differ.");
    return THEMES[color.theme] ? "#" + THEMES[color.theme] : undefined;
  }
  warnings.add("Indexed colors are not preserved."); return undefined;
}
export function colorToExcel(value: string | undefined, warnings: Warnings): Partial<Color> | undefined {
  if (!value) return undefined;
  if (/^#[\da-f]{6}$/i.test(value)) return { argb: "FF" + value.slice(1).toUpperCase() };
  if (/^#[\da-f]{3}$/i.test(value)) return { argb: "FF" + [...value.slice(1)].map((x) => x + x).join("").toUpperCase() };
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(value);
  if (rgb && rgb.slice(1).every((x) => Number(x) <= 255)) return { argb: "FF" + rgb.slice(1).map((x) => Number(x).toString(16).padStart(2, "0")).join("").toUpperCase() };
  warnings.add("Some non-RGB colors are not exported."); return undefined;
}
export function put<T>(grid: T[][] | undefined, row: number, col: number, value: T): T[][] {
  const next = grid ?? []; (next[row] ??= [])[col] = value; return next;
}
export function readStyle(cell: Cell, data: TableBlockPayload, r: number, c: number, warnings: Warnings): void {
  const key = `${r}_${c}`, font = cell.font, alignment = cell.alignment;
  const color = colorFromExcel(font?.color, warnings);
  if (color) data.cellTextColor = put(data.cellTextColor, r, c, color);
  if (font?.size) data.cellFontSizes = put(data.cellFontSizes, r, c, font.size);
  if (font?.name) (data.cellFont ??= {})[key] = font.name;
  const marks: TableCellMarks = { ...(font?.bold ? { bold: true } : {}), ...(font?.italic ? { italic: true } : {}),
    ...(font?.underline && font.underline !== "none" ? { underline: true } : {}), ...(font?.strike ? { strikethrough: true } : {}) };
  if (Object.keys(marks).length) data.cellContents = put(data.cellContents, r, c, {
    version: 1, blocks: [{ type: "paragraph", runs: [{ text: data.cells[r][c], marks }] }],
  });
  const fill = cell.fill;
  if (fill?.type === "pattern" && fill.pattern === "solid") {
    const background = colorFromExcel(fill.fgColor, warnings);
    if (background) data.cellBgColor = put(data.cellBgColor, r, c, background);
  } else if (fill && !(fill.type === "pattern" && fill.pattern === "none")) warnings.add("Gradient/pattern fills are not preserved.");
  const align = alignment?.horizontal;
  if (align === "left" || align === "center" || align === "right") data.cellAlign = put(data.cellAlign, r, c, align);
  else if (align) warnings.add("Advanced alignment is simplified.");
  const vertical = alignment?.vertical;
  if (vertical === "top" || vertical === "middle" || vertical === "bottom") (data.cellVerticalAlign ??= {})[key] = vertical;
  if (alignment?.wrapText !== undefined) (data.cellWrap ??= {})[key] = alignment.wrapText;
  if (alignment?.textRotation || alignment?.indent || alignment?.shrinkToFit) warnings.add("Text rotation, indentation and shrink-to-fit are not preserved.");
  if (cell.numFmt && cell.numFmt !== "General") data.cellFormats = put(data.cellFormats, r, c, { fa: cell.numFmt });
}
export function writeStyle(cell: Cell, data: TableBlockPayload, r: number, c: number, warnings: Warnings): void {
  const key = `${r}_${c}`, runs = data.cellContents?.[r]?.[c]?.blocks.flatMap((block) => block.runs) ?? [];
  const color = colorToExcel(data.cellTextColor?.[r]?.[c], warnings);
  cell.font = { ...(data.cellFont?.[key] ? { name: data.cellFont[key] } : {}),
    ...(data.cellFontSizes?.[r]?.[c] ? { size: data.cellFontSizes[r][c] } : {}), ...(color ? { color } : {}),
    bold: runs.some((x) => x.marks?.bold), italic: runs.some((x) => x.marks?.italic),
    underline: runs.some((x) => x.marks?.underline), strike: runs.some((x) => x.marks?.strikethrough) };
  const background = colorToExcel(data.cellBgColor?.[r]?.[c], warnings);
  if (background) cell.fill = { type: "pattern", pattern: "solid", fgColor: background };
  cell.alignment = { horizontal: data.cellAlign?.[r]?.[c], vertical: data.cellVerticalAlign?.[key], wrapText: data.cellWrap?.[key] };
  const format = data.cellFormats?.[r]?.[c] ?? data.columnFormats?.[c];
  if (format?.fa) cell.numFmt = format.fa;
}
