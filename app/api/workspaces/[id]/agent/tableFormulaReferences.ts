type Axis = "row" | "col";
type Mode = "insert" | "delete";
const colIndex = (letters: string) => [...letters.toUpperCase()].reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const colLetters = (index: number) => { let n = index + 1; let out = ""; while (n > 0) { out = String.fromCharCode(65 + ((n - 1) % 26)) + out; n = Math.floor((n - 1) / 26); } return out; };
const sameSheet = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
const sheetName = (prefix: string) => prefix.slice(0, -1).replace(/^'|'$/g, "").replace(/''/g, "'");
const ref = "(\\$?)([A-Z]{1,3})(\\$?)([1-9]\\d*)";
const references = () => new RegExp(`(?<![A-Za-z0-9_$'!])((?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?${ref}(?::${ref})?(?![A-Za-z0-9_(])`, "gi");

function outsideStrings(formula: string, transform: (part: string) => string): string {
  return formula.split(/("(?:[^"]|"")*")/g).map((part, index) => index % 2 ? part : transform(part)).join("");
}

export function renameFormulaSheet(formula: string, from: string, to?: string): string {
  return outsideStrings(formula, (part) => part.replace(references(), (whole, prefix) => {
    if (!prefix || !sameSheet(sheetName(prefix), from)) return whole;
    return to === undefined ? "#REF!" : `'${to.replace(/'/g, "''")}'!${whole.slice(prefix.length)}`;
  }));
}

export function shiftFormulaRefs(formula: string, axis: Axis, at: number, mode: Mode, targetSheet?: string, formulaSheet?: string): string {
  return outsideStrings(formula, (part) => part.replace(references(), (whole, prefix, d1, c1, d2, r1, e1, c2, e2, r2) => {
    if (prefix ? !targetSheet || !sameSheet(sheetName(prefix), targetSheet) : targetSheet && formulaSheet && !sameSheet(formulaSheet, targetSheet)) return whole;
    const parts = [{ colAbs: d1, col: colIndex(c1), rowAbs: d2, row: Number(r1) - 1 }];
    if (c2 !== undefined) parts.push({ colAbs: e1, col: colIndex(c2), rowAbs: e2, row: Number(r2) - 1 });
    const indices = parts.map((item) => axis === "row" ? item.row : item.col);
    if (mode === "delete" && indices.every((index) => index === at)) return "#REF!";
    const upper = Math.max(...indices);
    const moved = parts.map((item, index) => {
      const value = indices[index];
      const next = mode === "insert" ? value >= at ? value + 1 : value
        : value > at || value === at && value === upper ? value - 1 : value;
      return axis === "row" ? { ...item, row: next } : { ...item, col: next };
    });
    if (moved.some((item) => item.row < 0 || item.col < 0)) return "#REF!";
    return (prefix ?? "") + moved.map((item) => `${item.colAbs}${colLetters(item.col)}${item.rowAbs}${item.row + 1}`).join(":");
  }));
}

/** Shifts every relative (non-$) reference by a row/column delta, like copying
 * the formula to another cell. Used by fill-down, duplicate and sort. */
export function shiftRelativeRefs(formula: string, rowDelta: number, colDelta: number): string {
  return outsideStrings(formula, (part) => part.replace(references(), (whole, prefix, d1, c1, d2, r1, e1, c2, e2, r2) => {
    const parts = [{ colAbs: d1, col: colIndex(c1), rowAbs: d2, row: Number(r1) - 1 }];
    if (c2 !== undefined) parts.push({ colAbs: e1, col: colIndex(c2), rowAbs: e2, row: Number(r2) - 1 });
    const moved = parts.map((item) => ({
      ...item,
      row: item.rowAbs ? item.row : item.row + rowDelta,
      col: item.colAbs ? item.col : item.col + colDelta,
    }));
    if (moved.some((item) => item.row < 0 || item.col < 0)) return "#REF!";
    return (prefix ?? "") + moved.map((item) => `${item.colAbs}${colLetters(item.col)}${item.rowAbs}${item.row + 1}`).join(":");
  }));
}

/** Rewrites references to a row/column that moved to a new index, so formulas
 * keep pointing at the same data after a reorder (range ends map separately). */
export function remapFormulaRefs(formula: string, axis: Axis, mapIndex: (index: number) => number, targetSheet?: string, formulaSheet?: string, onRangeChange?: () => void): string {
  return outsideStrings(formula, (part) => part.replace(references(), (whole, prefix, d1, c1, d2, r1, e1, c2, e2, r2) => {
    if (prefix ? !targetSheet || !sameSheet(sheetName(prefix), targetSheet) : targetSheet && formulaSheet && !sameSheet(formulaSheet, targetSheet)) return whole;
    const parts = [{ colAbs: d1, col: colIndex(c1), rowAbs: d2, row: Number(r1) - 1 }];
    if (c2 !== undefined) parts.push({ colAbs: e1, col: colIndex(c2), rowAbs: e2, row: Number(r2) - 1 });
    const moved = parts.map((item) => axis === "row" ? { ...item, row: mapIndex(item.row) } : { ...item, col: mapIndex(item.col) });
    if (moved.length === 2) {
      // Keep the range covering the same lines: hull of the images of every line of the original range.
      const key = axis === "row" ? "row" : "col";
      const [from, to] = [Math.min(parts[0][key], parts[1][key]), Math.max(parts[0][key], parts[1][key])];
      const images = to - from > 20000 ? moved.map((item) => item[key]) : Array.from({ length: to - from + 1 }, (_, offset) => mapIndex(from + offset));
      const low = Math.min(...images);
      const high = Math.max(...images);
      if (high - low !== to - from) onRangeChange?.();
      moved[0][key] = low;
      moved[1][key] = high;
    }
    return (prefix ?? "") + moved.map((item) => `${item.colAbs}${colLetters(item.col)}${item.rowAbs}${item.row + 1}`).join(":");
  }));
}
