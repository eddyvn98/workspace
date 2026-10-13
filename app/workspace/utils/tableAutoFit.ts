export type TableAutoFit = {
  width: number;
  height: number;
  rowWeights: number[];
  colWeights: number[];
};

const MIN_COLUMN_WIDTH = 96;
const MAX_COLUMN_WIDTH = 300;
const MAX_TABLE_WIDTH = 1440;
const MIN_ROW_HEIGHT = 40;
const MAX_ROW_HEIGHT = 180;
const MAX_TABLE_HEIGHT = 1000;

function textWidthUnits(value: unknown): number {
  return String(value ?? "").split("\n").reduce((max, line) => {
    const width = Array.from(line).reduce((sum, char) => (
      sum + ((char.codePointAt(0) ?? 0) > 0x2e80 ? 1.8 : 1)
    ), 0);
    return Math.max(max, width);
  }, 0);
}

export function fitTableContent(cells: unknown): TableAutoFit {
  const source = Array.isArray(cells) ? cells : [];
  const rows = Math.max(1, source.length);
  const cols = Math.max(1, ...source.map((row) => Array.isArray(row) ? row.length : 0));
  const grid = Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => (
    Array.isArray(source[row]) ? source[row][col] : ""
  )));

  const desiredWidths = Array.from({ length: cols }, (_, col) => {
    const longest = Math.max(0, ...grid.map((row) => textWidthUnits(row[col])));
    return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.ceil(longest * 7.2 + 32)));
  });
  const widthScale = Math.min(1, MAX_TABLE_WIDTH / desiredWidths.reduce((sum, value) => sum + value, 0));
  const colWeights = desiredWidths.map((value) => Math.max(48, Math.round(value * widthScale)));
  const width = Math.max(400, colWeights.reduce((sum, value) => sum + value, 0));

  const rowWeights = grid.map((row) => {
    const lines = Math.max(1, ...row.map((value, col) => {
      const capacity = Math.max(8, Math.floor((colWeights[col] - 28) / 7.2));
      return Math.ceil(textWidthUnits(value) / capacity);
    }));
    return Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, lines * 19 + 20));
  });
  const rawHeight = rowWeights.reduce((sum, value) => sum + value, 0);
  if (rawHeight > MAX_TABLE_HEIGHT) {
    const scale = MAX_TABLE_HEIGHT / rawHeight;
    rowWeights.forEach((value, index) => { rowWeights[index] = Math.max(30, Math.round(value * scale)); });
  }
  return { width, height: Math.min(MAX_TABLE_HEIGHT, rowWeights.reduce((sum, value) => sum + value, 0)), rowWeights, colWeights };
}
