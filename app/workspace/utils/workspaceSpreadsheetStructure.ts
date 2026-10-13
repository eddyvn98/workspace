import type { Cell, Sheet } from "@fortune-sheet/core";
import type { TableBlockPayload, TableSheetRange, TableSheetStructure } from "../types/table";

type Json = Record<string, unknown>;
type Keyed<T> = Record<string, T>;

const VERTICAL = ["middle", "top", "bottom"] as const;
const isRecord = (value: unknown): value is Json => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nonEmpty = <T extends object>(value: T | undefined): T | undefined => (value && Object.keys(value).length ? value : undefined);
const clone = <T,>(value: T): T => (value === undefined ? value : structuredClone(value));

function indexFlags(indices: number[] | undefined): Record<string, number> | undefined {
  return indices?.length ? Object.fromEntries(indices.map((index) => [String(index), 0])) : undefined;
}

function flagIndices(flags: Record<string, number> | undefined): number[] | undefined {
  const list = Object.keys(flags ?? {}).map(Number).filter((index) => Number.isInteger(index) && index >= 0).sort((a, b) => a - b);
  return list.length ? list : undefined;
}

function frozenToFortune(frozen: TableSheetStructure["frozen"]): Sheet["frozen"] | undefined {
  if (!frozen?.type) return undefined;
  return { type: frozen.type as NonNullable<Sheet["frozen"]>["type"], range: { row_focus: frozen.row ?? 0, column_focus: frozen.col ?? 0 } };
}

function frozenFromFortune(frozen: Sheet["frozen"]): TableSheetStructure["frozen"] {
  if (!frozen?.type) return undefined;
  const range = frozen.range;
  return { type: frozen.type, ...(range ? { row: range.row_focus, col: range.column_focus } : {}) };
}

/** Sheet-level structures of a table payload, in Fortune sheet shape. */
export function sheetStructureToFortune(data: TableSheetStructure): Partial<Sheet> {
  const hyperlink = nonEmpty(clone(data.cellLinks));
  const filter = data.autoFilter;
  return {
    ...(data.sheetColor ? { color: data.sheetColor } : {}),
    ...(data.sheetHidden ? { hide: 1 } : {}),
    ...(data.frozen ? { frozen: frozenToFortune(data.frozen) } : {}),
    ...(filter ? { filter_select: { row: [...filter.range.row], column: [...filter.range.column] }, ...(filter.filters ? { filter: clone(filter.filters) as Json } : {}) } : {}),
    ...(data.conditionalFormats?.length ? { luckysheet_conditionformat_save: clone(data.conditionalFormats) } : {}),
    ...(data.dataValidations && Object.keys(data.dataValidations).length ? { dataVerification: clone(data.dataValidations) } : {}),
    ...(hyperlink ? { hyperlink } : {}),
  };
}

/** Fortune `config` additions: borders, hidden rows and hidden columns. */
export function structureConfigToFortune(data: TableSheetStructure): NonNullable<Sheet["config"]> {
  return {
    ...(data.borderInfo?.length ? { borderInfo: clone(data.borderInfo) } : {}),
    ...(data.hiddenRows?.length ? { rowhidden: indexFlags(data.hiddenRows) } : {}),
    ...(data.hiddenCols?.length ? { colhidden: indexFlags(data.hiddenCols) } : {}),
  };
}

/** Adds the per-cell structure attributes (wrap, vertical align, font, link, note). */
export function decorateFortuneCell(cell: Cell, data: TableSheetStructure, row: number, col: number, sheetId: string): void {
  const key = `${row}_${col}`;
  const wrap = data.cellWrap?.[key];
  if (wrap !== undefined) cell.tb = wrap ? "2" : "0";
  const vertical = data.cellVerticalAlign?.[key];
  if (vertical) cell.vt = VERTICAL.indexOf(vertical);
  const font = data.cellFont?.[key];
  if (font) cell.ff = font;
  const note = data.cellNotes?.[key];
  if (note) cell.ps = { left: note.left ?? null, top: note.top ?? null, width: note.width ?? null, height: note.height ?? null, value: note.value, isShow: Boolean(note.isShow) };
  if (data.cellLinks?.[key]) cell.hl = { r: row, c: col, id: sheetId };
}

/** True when a Fortune cell carries structure attributes worth persisting. */
export function hasCellStructure(cell: Cell): boolean {
  return cell.tb !== undefined || cell.ff !== undefined || cell.cl === 1 || cell.ps !== undefined || cell.hl !== undefined;
}

/** Reads every sheet and cell structure back into table payload fields. */
export function readSheetStructure(sheet: Sheet, previous: TableBlockPayload, rows: number, cols: number): TableSheetStructure {
  const wrap: Keyed<boolean> = {};
  const vertical: Keyed<"top" | "middle" | "bottom"> = {};
  const font: Keyed<string> = {};
  const notes: NonNullable<TableSheetStructure["cellNotes"]> = {};
  const links: NonNullable<TableSheetStructure["cellLinks"]> = {};
  (sheet.data ?? []).forEach((line, row) => line?.forEach((cell, col) => {
    if (!cell || row >= rows || col >= cols) return;
    const key = `${row}_${col}`;
    if (cell.tb === "2") wrap[key] = true;
    else if (cell.tb === "0") wrap[key] = false;
    if (typeof cell.vt === "number" && cell.vt > 0 && VERTICAL[cell.vt]) vertical[key] = VERTICAL[cell.vt];
    if (cell.ff !== undefined && cell.ff !== "") font[key] = String(cell.ff);
    if (cell.ps && (cell.ps.value || cell.ps.isShow)) {
      notes[key] = { value: String(cell.ps.value ?? ""), isShow: Boolean(cell.ps.isShow), left: cell.ps.left, top: cell.ps.top, width: cell.ps.width, height: cell.ps.height };
    }
    const link = cell.hl ? sheet.hyperlink?.[key] : undefined;
    if (link) links[key] = { linkType: link.linkType, linkAddress: link.linkAddress };
  }));
  const range = sheet.filter_select;
  const filtered = range?.row?.length === 2 && range.column?.length === 2;
  const criteria = previous.autoFilter?.criteria;
  const dataValidations = isRecord(sheet.dataVerification) ? clone(sheet.dataVerification) as TableSheetStructure["dataValidations"] : undefined;
  return {
    borderInfo: sheet.config?.borderInfo?.length ? clone(sheet.config.borderInfo) : undefined,
    frozen: frozenFromFortune(sheet.frozen),
    hiddenRows: flagIndices(sheet.config?.rowhidden),
    hiddenCols: flagIndices(sheet.config?.colhidden),
    autoFilter: filtered ? {
      range: { row: [range!.row[0], range!.row[1]], column: [range!.column[0], range!.column[1]] } as TableSheetRange,
      ...(nonEmpty(sheet.filter) ? { filters: clone(sheet.filter) } : {}),
      ...(criteria ? { criteria } : {}),
    } : undefined,
    conditionalFormats: sheet.luckysheet_conditionformat_save?.length ? clone(sheet.luckysheet_conditionformat_save) : undefined,
    dataValidations: nonEmpty(dataValidations ?? {}),
    cellLinks: nonEmpty(links),
    cellNotes: nonEmpty(notes),
    cellWrap: nonEmpty(wrap),
    cellVerticalAlign: nonEmpty(vertical),
    cellFont: nonEmpty(font),
    sheetColor: sheet.color || undefined,
    sheetHidden: sheet.hide === 1 ? true : undefined,
  };
}
