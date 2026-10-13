import type React from "react";
import type { SlideTheme } from "../types/slide";
import { parseSlideThemePreset } from "./slideThemePresets";

const NAMED_COLORS = new Set([
  "transparent", "white", "black", "gray", "grey", "silver", "red", "green", "blue", "yellow", "orange", "purple",
  "pink", "brown", "teal", "navy", "maroon", "olive", "lime", "aqua", "cyan", "magenta", "gold", "indigo", "violet",
  "coral", "crimson", "salmon", "tan", "beige", "ivory", "khaki", "lavender", "turquoise", "slategray", "slategrey",
]);

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(?:rgba?|hsla?)\(\s*[\d\s.,%/+-]*(?:deg|turn|rad|grad)?[\d\s.,%/+-]*\)$/i;
const FONT_FAMILY = /^[\w\s,'"-]{1,120}$/;

/** True for hex, rgb()/hsl() and a short list of common CSS colour names. */
export function isCssColor(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return HEX.test(text) || FUNCTIONAL.test(text) || NAMED_COLORS.has(text.toLowerCase());
}

/** A plain CSS font-family list: letters, digits, spaces, commas, quotes and dashes only. */
export function isSafeFontFamily(value: unknown): value is string {
  return typeof value === "string" && FONT_FAMILY.test(value.trim());
}

/** Keeps only valid theme fields; returns undefined when nothing valid remains. */
export function normalizeSlideTheme(input: unknown): SlideTheme | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const raw = input as Record<string, unknown>;
  const theme: SlideTheme = {};
  if (isCssColor(raw.backgroundColor)) theme.backgroundColor = raw.backgroundColor.trim();
  if (isCssColor(raw.textColor)) theme.textColor = raw.textColor.trim();
  if (isCssColor(raw.accentColor)) theme.accentColor = raw.accentColor.trim();
  if (isSafeFontFamily(raw.fontFamily)) theme.fontFamily = raw.fontFamily.trim();
  const preset = parseSlideThemePreset(raw.preset);
  if (preset) theme.preset = preset;
  return Object.keys(theme).length ? theme : undefined;
}

export const DEFAULT_SLIDE_TEXT_COLOR = "#1e293b";
export const DEFAULT_SLIDE_ACCENT_COLOR = "#2563eb";

/** Inline style for the slide text surface (editor, thumbnails, Present mode).
 *  `--slide-accent` feeds the typography sheet in slideTypography.ts. */
export function slideTextStyle(theme: SlideTheme | undefined): React.CSSProperties {
  return {
    color: theme?.textColor ?? DEFAULT_SLIDE_TEXT_COLOR,
    ...(theme?.fontFamily ? { fontFamily: theme.fontFamily } : {}),
    ["--slide-accent" as string]: theme?.accentColor ?? DEFAULT_SLIDE_ACCENT_COLOR,
  };
}

/** Slide background: the slide's own colour, then the deck theme, then white. */
export function slideBackground(slideColor: string | undefined, theme: SlideTheme | undefined): string {
  return slideColor ?? theme?.backgroundColor ?? "#ffffff";
}
