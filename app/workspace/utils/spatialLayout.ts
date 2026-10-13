export const SPATIAL_LAYOUT_MODES = ["grid", "row", "column", "align_left", "align_center", "align_right", "align_top", "align_middle", "align_bottom", "distribute_horizontal", "distribute_vertical"] as const;
export type SpatialLayoutMode = typeof SPATIAL_LAYOUT_MODES[number];
export interface SpatialRect { id: string; x: number; y: number; w: number; h: number }

/** Plan every coordinate before mutating; unequal sizes must never overlap in a grid. */
export function planSpatialLayout(rects: SpatialRect[], mode: string, gap = 32, requestedColumns?: number): Map<string, { x: number; y: number }> | null {
  if (rects.length < 2 || !SPATIAL_LAYOUT_MODES.includes(mode as SpatialLayoutMode)) return null;
  if (!Number.isFinite(gap) || gap < 0 || gap > 1000 || rects.some((r) => ![r.x, r.y, r.w, r.h].every(Number.isFinite) || r.w <= 0 || r.h <= 0)) return null;
  const result = new Map(rects.map((r) => [r.id, { x: r.x, y: r.y }]));
  const minX = Math.min(...rects.map((r) => r.x)), minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w)), maxY = Math.max(...rects.map((r) => r.y + r.h));
  if (mode === "grid" || mode === "row" || mode === "column") {
    const columns = mode === "row" ? rects.length : mode === "column" ? 1 : requestedColumns ?? Math.ceil(Math.sqrt(rects.length));
    if (!Number.isInteger(columns) || columns < 1 || columns > rects.length) return null;
    const widths = Array(columns).fill(0), heights = Array(Math.ceil(rects.length / columns)).fill(0);
    rects.forEach((r, i) => { widths[i % columns] = Math.max(widths[i % columns], r.w); heights[Math.floor(i / columns)] = Math.max(heights[Math.floor(i / columns)], r.h); });
    const starts = (sizes: number[], origin: number) => { let at = origin; return sizes.map((size) => { const start = at; at += size + gap; return start; }); };
    const xs = starts(widths, rects[0].x), ys = starts(heights, rects[0].y);
    rects.forEach((r, i) => result.set(r.id, { x: xs[i % columns], y: ys[Math.floor(i / columns)] }));
  } else if (mode.startsWith("align_")) {
    rects.forEach((r) => result.set(r.id, {
      x: mode === "align_left" ? minX : mode === "align_center" ? (minX + maxX - r.w) / 2 : mode === "align_right" ? maxX - r.w : r.x,
      y: mode === "align_top" ? minY : mode === "align_middle" ? (minY + maxY - r.h) / 2 : mode === "align_bottom" ? maxY - r.h : r.y,
    }));
  } else {
    if (rects.length < 3) return null;
    const horizontal = mode === "distribute_horizontal";
    const sorted = [...rects].sort((a, b) => horizontal ? a.x - b.x : a.y - b.y);
    const start = horizontal ? sorted[0].x : sorted[0].y, last = sorted[sorted.length - 1];
    const end = horizontal ? last.x + last.w : last.y + last.h;
    const total = sorted.reduce((sum, r) => sum + (horizontal ? r.w : r.h), 0);
    // Expand an overlapping selection enough to give it a useful non-negative gap.
    const spacing = Math.max(gap, (end - start - total) / (sorted.length - 1));
    let position = start;
    sorted.forEach((r) => { result.set(r.id, horizontal ? { x: position, y: r.y } : { x: r.x, y: position }); position += (horizontal ? r.w : r.h) + spacing; });
  }
  return result;
}
