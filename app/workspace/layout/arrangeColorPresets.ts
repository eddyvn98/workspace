/**
 * Named cycling color palettes for the "Arrange Selection" one-shot
 * commands (WorkspaceArrangeMenu.tsx) — an adapted, much smaller version of
 * the old app's whole-map STYLE_PRESETS (components/features/chat/mindmap/mindmap-presets.ts):
 * that system paints canvas background + root node + a branch-color cycle
 * tied to tree depth, none of which has an equivalent in this flat block
 * model. What DOES carry over is the cycling color palette itself, applied
 * here to the connectors an arrange command creates (one color per
 * rib/segment/step) rather than to block backgrounds, which stay
 * untouched — an arrange command shouldn't silently repaint content the
 * user already styled.
 */
export interface ArrangeColorPreset {
  id: string;
  name: string;
  colors: string[];
}

export const ARRANGE_COLOR_PRESETS: ArrangeColorPreset[] = [
  { id: "pastel", name: "Soft Pastel", colors: ["#fca5a5", "#fcd34d", "#86efac", "#93c5fd", "#c084fc", "#f472b6"] },
  { id: "minimal", name: "Minimalist", colors: ["#d4d4d8", "#a1a1aa", "#71717a", "#e4e4e7", "#d4d4d8", "#a1a1aa"] },
  { id: "monochrome", name: "Monochrome Blue", colors: ["#60a5fa", "#3b82f6", "#1d4ed8", "#93c5fd", "#bfdbfe", "#2563eb"] },
  { id: "vibrant", name: "Vibrant Neon", colors: ["#f43f5e", "#06b6d4", "#a855f7", "#10b981", "#f59e0b", "#3b82f6"] },
];

/** Picks the color at `index`, wrapping around the palette — or undefined
 *  (falls back to the connector's default stroke) when no preset is active. */
export function colorForArrangeIndex(preset: ArrangeColorPreset | null, index: number): string | undefined {
  if (!preset || preset.colors.length === 0) return undefined;
  return preset.colors[index % preset.colors.length];
}
