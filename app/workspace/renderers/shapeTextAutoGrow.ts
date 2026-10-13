// Ports legacy's estimateCanvasShapeTextHeight (app/mindmap/components/svg/
// canvasShapeTextSizing.ts) — a rough char-count-per-line heuristic used to
// auto-grow a shape while its label is typed, not a pixel-exact text
// measurement. Legacy itself only distinguishes a quote's wider side insets
// from every other shape, not the full per-shape geometry table Workspace
// otherwise uses for rendering (shapeTextInset.ts) — a flat padding here
// matches that same approximation, not a regression from it.
// Matches legacy's default (non-quote) CANVAS_SHAPE_TEXT_INSET (6) plus
// CANVAS_SHAPE_TEXT_PADDING (2) per side, combined into one flat constant
// since Workspace doesn't need the inset/padding split for this estimate.
const TEXT_PADDING_X = 8;
const TEXT_PADDING_Y = 8;
const CHAR_WIDTH_RATIO = 0.52;
const LINE_HEIGHT_RATIO = 1.4;

export function estimateWorkspaceShapeTextHeight(text: string, width: number, fontSize: number): number {
  const availableWidth = Math.max(1, width - TEXT_PADDING_X * 2);
  const charWidth = Math.max(1, fontSize * CHAR_WIDTH_RATIO);
  const charsPerLine = Math.max(1, Math.floor(availableWidth / charWidth));
  const lines = text.split("\n").reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)),
    0,
  );
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  return Math.ceil(lines * lineHeight + TEXT_PADDING_Y * 2);
}
