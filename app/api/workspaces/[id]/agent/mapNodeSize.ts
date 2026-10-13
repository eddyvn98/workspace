import type { AgentBoardState } from "./operationsCore";

const MIN_W = 96;
const MAX_W = 260;
const MIN_H = 40;
// Same metrics TextBlock renders with: 11px type, 1.5 line height, 8px padding.
const FONT_SIZE = 11;
const PADDING = 8;
const LINE_HEIGHT = 1.5;

const isWide = (char: string) => /[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(char);

function plain(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/[*_`~#>]/g, "").replace(/[ \t]+/g, " ").trim();
}

/** Estimated box for a map node so it hugs its text instead of the 220x100
 * default. Child nodes render semi-bold, so glyphs are measured a little wider. */
export function fitMapNodeSize(rawText: string): { w: number; h: number } {
  const lines = plain(rawText).split(/\n+/).filter(Boolean);
  const widthOf = (line: string) => [...line].reduce((sum, char) => sum + (isWide(char) ? FONT_SIZE : FONT_SIZE * (/[A-Z0-9]/.test(char) ? 0.7 : 0.62)), 0);
  const longest = Math.max(0, ...lines.map(widthOf));
  const w = Math.min(MAX_W, Math.max(MIN_W, Math.ceil((longest + PADDING * 2 + 16) / 4) * 4));
  const inner = Math.max(1, w - PADDING * 2 - 8);
  const rows = Math.max(1, lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(widthOf(line) / inner)), 0));
  const h = Math.max(MIN_H, Math.ceil((rows * FONT_SIZE * LINE_HEIGHT + PADDING * 2 + 14) / 4) * 4);
  return { w, h };
}

type Sized = { override?: { w?: number; h?: number } | null };

/** Gives every node of the same depth the width and height of the largest one,
 * so each column and row of the map lines up and both sides mirror each other. */
export function equalizeMapLevelSizes(state: AgentBoardState, createdIds: string[]): void {
  const created = new Set(createdIds);
  const depthOf = (id: string): number => {
    let depth = 0;
    let current = state.blocks[id];
    while (current && typeof current.parentId === "string" && created.has(current.parentId) && depth < 50) {
      depth += 1;
      current = state.blocks[current.parentId];
    }
    return depth;
  };
  const levels = new Map<number, string[]>();
  createdIds.forEach((id) => levels.set(depthOf(id), [...(levels.get(depthOf(id)) ?? []), id]));
  levels.forEach((ids) => {
    const sizes = ids.map((id) => (state.blocks[id].transform as Sized | undefined)?.override).filter((o): o is { w?: number; h?: number } => Boolean(o));
    const w = Math.max(...sizes.map((o) => Number(o.w) || 0));
    const h = Math.max(...sizes.map((o) => Number(o.h) || 0));
    sizes.forEach((o) => { o.w = w; o.h = h; });
  });
}
