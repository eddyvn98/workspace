import type { SlideElement } from "./slide-export-scene";

export function wrapExportText(text: string, columns: number): string[] {
  const result: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (line && line.length + word.length + 1 > columns) { result.push(line); line = ""; }
      if (word.length > columns) {
        if (line) { result.push(line); line = ""; }
        for (let start = 0; start < word.length; start += columns) result.push(word.slice(start, start + columns));
      } else line += `${line ? " " : ""}${word}`;
    }
    if (line || !paragraph) result.push(line);
  }
  return result;
}

export function exportElementHeight(element: SlideElement, width: number): number {
  if (element.kind === "image") return 330;
  if (element.kind === "chart") return 320;
  if (element.kind === "table") {
    const cols = Math.max(1, ...element.rows.map((r) => r.length));
    return element.rows.reduce((height, row) => height + Math.max(48, ...row.map((text) => wrapExportText(text, Math.max(1, Math.floor((width / cols - 24) / 12))).length * 27 + 16)), 0);
  }
  const size = element.heading ? 32 : 20;
  return wrapExportText(element.text, Math.max(1, Math.floor(width / (size * 0.75)))).length * size * 1.6 + 12;
}

export function slideExportLayout(elements: SlideElement[], width: number, index: number) {
  const contentWidth = width - 112, heights = elements.map((e) => exportElementHeight(e, contentWidth));
  const totalHeight = heights.reduce((n, h) => n + h, 0) + Math.max(0, elements.length - 1) * 14;
  const scale = Math.min(1, 600 / Math.max(1, totalHeight));
  if (scale < 0.45) throw new Error(`Slide ${index + 1} has too much content for a readable page. Split it into more slides.`);
  return { contentWidth, heights, scale };
}
