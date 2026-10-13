import type { SlideTheme } from "../types/slide";

export const SLIDE_THEME_PRESET_IDS = ["clean", "dark", "corporate-blue", "warm", "forest", "minimal-mono"] as const;
export type SlideThemePresetId = typeof SLIDE_THEME_PRESET_IDS[number];

const SANS = "Arial, Helvetica, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

export const SLIDE_THEME_PRESETS: Record<SlideThemePresetId, { label: string; theme: Required<Omit<SlideTheme, "preset">> }> = {
  clean: { label: "Clean", theme: { backgroundColor: "#ffffff", textColor: "#1e293b", accentColor: "#2563eb", fontFamily: SANS } },
  dark: { label: "Dark", theme: { backgroundColor: "#0f172a", textColor: "#f1f5f9", accentColor: "#38bdf8", fontFamily: SANS } },
  "corporate-blue": { label: "Corporate blue", theme: { backgroundColor: "#eff6ff", textColor: "#0b2a4a", accentColor: "#1d4ed8", fontFamily: SANS } },
  warm: { label: "Warm", theme: { backgroundColor: "#fff7ed", textColor: "#431407", accentColor: "#ea580c", fontFamily: SERIF } },
  forest: { label: "Forest", theme: { backgroundColor: "#f0fdf4", textColor: "#14532d", accentColor: "#16a34a", fontFamily: SANS } },
  "minimal-mono": { label: "Minimal mono", theme: { backgroundColor: "#fafafa", textColor: "#18181b", accentColor: "#52525b", fontFamily: "'Courier New', monospace" } },
};

/** Accepts "Corporate Blue", "corporate_blue" etc. */
export function parseSlideThemePreset(input: unknown): SlideThemePresetId | undefined {
  const normalized = String(input ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return (SLIDE_THEME_PRESET_IDS as readonly string[]).includes(normalized) ? normalized as SlideThemePresetId : undefined;
}

/** The full theme (colours, accent, font, preset id) for a preset. */
export function themeFromPreset(id: SlideThemePresetId): SlideTheme {
  return { ...SLIDE_THEME_PRESETS[id].theme, preset: id };
}
