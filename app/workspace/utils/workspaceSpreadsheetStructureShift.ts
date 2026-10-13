type Json = Record<string, unknown>;
type Axis = "row" | "col";
type Mode = "insert" | "delete";
type Pair = [number, number];

const isRecord = (value: unknown): value is Json => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Index after inserting/deleting one line at `at`; null when the line is deleted. */
export function shiftLineIndex(index: number, at: number, mode: Mode): number | null {
  if (mode === "insert") return index >= at ? index + 1 : index;
  return index === at ? null : index > at ? index - 1 : index;
}

/** Inclusive span after a shift: grows when a line is inserted inside it, shrinks on delete. */
export function shiftLineSpan([start, end]: Pair, at: number, mode: Mode): Pair | null {
  if (mode === "insert") return start >= at ? [start + 1, end + 1] : end >= at ? [start, end + 1] : [start, end];
  if (end < at) return [start, end];
  if (start > at) return [start - 1, end - 1];
  return start === end ? null : [start, end - 1];
}

function shiftIndexList(list: unknown, at: number, mode: Mode): number[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const next = list.map((item) => shiftLineIndex(Number(item), at, mode)).filter((item): item is number => item !== null);
  return next.length ? next : undefined;
}

function shiftKeyed(source: unknown, axis: Axis, at: number, mode: Mode): Json | undefined {
  if (!isRecord(source)) return undefined;
  const next: Json = {};
  for (const [key, value] of Object.entries(source)) {
    const [row, col] = key.split("_").map(Number);
    if (!Number.isInteger(row) || !Number.isInteger(col)) { next[key] = value; continue; }
    const moved = shiftLineIndex(axis === "row" ? row : col, at, mode);
    if (moved !== null) next[axis === "row" ? `${moved}_${col}` : `${row}_${moved}`] = value;
  }
  return Object.keys(next).length ? next : undefined;
}

function shiftRangeObject(range: unknown, axis: Axis, at: number, mode: Mode): Json | null {
  if (!isRecord(range) || !Array.isArray(range.row) || !Array.isArray(range.column)) return null;
  const field = axis === "row" ? "row" : "column";
  const span = shiftLineSpan(range[field] as Pair, at, mode);
  return span ? { ...range, [field]: span } : null;
}

function shiftRangeList(list: unknown, axis: Axis, at: number, mode: Mode): Json[] {
  return (Array.isArray(list) ? list : []).map((range) => shiftRangeObject(range, axis, at, mode)).filter((range): range is Json => range !== null);
}

function shiftBorders(borders: unknown, axis: Axis, at: number, mode: Mode): Json[] | undefined {
  if (!Array.isArray(borders)) return undefined;
  const next = borders.flatMap((entry): Json[] => {
    if (!isRecord(entry)) return [entry as Json];
    if (entry.rangeType === "cell" && isRecord(entry.value)) {
      const field = axis === "row" ? "row_index" : "col_index";
      const moved = shiftLineIndex(Number(entry.value[field]), at, mode);
      return moved === null ? [] : [{ ...entry, value: { ...entry.value, [field]: moved } }];
    }
    const ranges = shiftRangeList(entry.range, axis, at, mode);
    return ranges.length ? [{ ...entry, range: ranges }] : [];
  });
  return next.length ? next : undefined;
}

function shiftConditionalFormats(rules: unknown, axis: Axis, at: number, mode: Mode): Json[] | undefined {
  if (!Array.isArray(rules)) return undefined;
  const next = rules.flatMap((rule): Json[] => {
    if (!isRecord(rule)) return [];
    const cellrange = shiftRangeList(rule.cellrange, axis, at, mode);
    return cellrange.length ? [{ ...rule, cellrange, ...(Array.isArray(rule.conditionRange) ? { conditionRange: shiftRangeList(rule.conditionRange, axis, at, mode) } : {}) }] : [];
  });
  return next.length ? next : undefined;
}

function shiftFilters(filters: unknown, axis: Axis, at: number, mode: Mode): Json | undefined {
  if (!isRecord(filters)) return undefined;
  const next: Json = {};
  for (const [key, filter] of Object.entries(filters)) {
    if (!isRecord(filter)) continue;
    if (axis === "col") {
      const moved = shiftLineIndex(Number(key), at, mode);
      if (moved !== null) next[String(moved)] = { ...filter, cindex: moved };
      continue;
    }
    const hidden = isRecord(filter.rowhidden) ? Object.fromEntries(Object.entries(filter.rowhidden).flatMap(([row, flag]) => {
      const moved = shiftLineIndex(Number(row), at, mode);
      return moved === null ? [] : [[String(moved), flag]];
    })) : filter.rowhidden;
    const span = shiftLineSpan([Number(filter.str), Number(filter.edr)], at, mode);
    next[key] = { ...filter, rowhidden: hidden, ...(span && Number.isFinite(span[0]) ? { str: span[0], edr: span[1] } : {}) };
  }
  return Object.keys(next).length ? next : undefined;
}

function shiftFrozen(frozen: unknown, axis: Axis, at: number, mode: Mode): Json | undefined {
  if (!isRecord(frozen) || typeof frozen.type !== "string") return undefined;
  const type = frozen.type;
  const rowBased = type === "rangeRow" || type === "rangeBoth";
  const colBased = type === "rangeColumn" || type === "rangeBoth";
  const key = axis === "row" ? "row" : "col";
  if (!(axis === "row" ? rowBased : colBased) || typeof frozen[key] !== "number") return frozen;
  const last = frozen[key] as number;
  // The frozen block covers lines 0..last; an insert inside it grows it, a delete shrinks it.
  const next = at <= last ? last + (mode === "insert" ? 1 : -1) : last;
  if (next >= 0) return { ...frozen, [key]: next };
  if (type === "rangeBoth") return { ...frozen, type: axis === "row" ? "rangeColumn" : "rangeRow", [key]: undefined };
  return undefined;
}

function assign(data: Json, key: string, value: unknown): void {
  if (value === undefined) delete data[key];
  else data[key] = value;
}

/** Moves every spreadsheet structure (borders, hidden lines, filter, rules,
 *  validations, links, notes, per-cell attributes, frozen panes) with a
 *  single row/column insert or delete so it stays attached to its cells. */
export function shiftSheetStructures(data: Json, axis: Axis, at: number, mode: Mode): void {
  assign(data, axis === "row" ? "hiddenRows" : "hiddenCols", shiftIndexList(data[axis === "row" ? "hiddenRows" : "hiddenCols"], at, mode));
  for (const field of ["cellLinks", "cellNotes", "cellWrap", "cellVerticalAlign", "cellFont", "dataValidations"]) {
    assign(data, field, shiftKeyed(data[field], axis, at, mode));
  }
  assign(data, "borderInfo", shiftBorders(data.borderInfo, axis, at, mode));
  assign(data, "conditionalFormats", shiftConditionalFormats(data.conditionalFormats, axis, at, mode));
  assign(data, "frozen", shiftFrozen(data.frozen, axis, at, mode));
  const filter = data.autoFilter;
  if (isRecord(filter)) {
    const range = shiftRangeObject(filter.range, axis, at, mode);
    const filters = shiftFilters(filter.filters, axis, at, mode);
    const criteria = isRecord(filter.criteria) && axis === "col" && typeof filter.criteria.column === "number"
      ? ((moved) => moved === null ? undefined : { ...filter.criteria as Json, column: moved })(shiftLineIndex(filter.criteria.column, at, mode))
      : filter.criteria;
    assign(data, "autoFilter", range ? { ...filter, range, filters, criteria } : undefined);
  }
}
