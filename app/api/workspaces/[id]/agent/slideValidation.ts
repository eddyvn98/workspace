import { isCssColor, isSafeFontFamily } from "@/app/workspace/utils/slideTheme";
import { parseSlideThemePreset, SLIDE_THEME_PRESET_IDS, themeFromPreset } from "@/app/workspace/utils/slideThemePresets";

export const SLIDE_STATUSES = ["not_started", "in_progress", "done"] as const;

/** `value` undefined means "clear the field". */
export type Parsed<T> = { ok: true; value: T | undefined } | { ok: false; reason: string };

const isClear = (input: unknown) => typeof input === "string" && ["", "none", "null", "default"].includes(input.trim().toLowerCase());

export function parseStatus(input: unknown): Parsed<string> {
  if (isClear(input)) return { ok: true, value: undefined };
  const normalized = String(input).trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (SLIDE_STATUSES as readonly string[]).includes(normalized)
    ? { ok: true, value: normalized }
    : { ok: false, reason: `Invalid status "${String(input)}". Use one of: ${SLIDE_STATUSES.join(", ")} (or "none" to clear).` };
}

export function parseColor(input: unknown, field: string): Parsed<string> {
  if (isClear(input)) return { ok: true, value: undefined };
  return isCssColor(input)
    ? { ok: true, value: input.trim() }
    : { ok: false, reason: `Invalid ${field} "${String(input)}". Use a hex colour like #1e293b, rgb()/hsl(), or a basic CSS colour name (or "none" to clear).` };
}

export function parseBoolean(input: unknown, field: string): Parsed<boolean> {
  if (typeof input === "boolean") return { ok: true, value: input };
  if (input === "true" || input === "false") return { ok: true, value: input === "true" };
  return { ok: false, reason: `Invalid ${field} "${String(input)}". Use true or false.` };
}

export function parseFontFamily(input: unknown): Parsed<string> {
  if (isClear(input)) return { ok: true, value: undefined };
  return isSafeFontFamily(input)
    ? { ok: true, value: input.trim() }
    : { ok: false, reason: `Invalid fontFamily "${String(input)}". Use a plain font-family list such as "Georgia, serif".` };
}

/** Parses a `theme` object ({preset?, backgroundColor, textColor, accentColor, fontFamily}) into a patch; cleared fields map to undefined.
 *  A preset fills every field; explicit fields override it. Hand-picked colours without a preset clear the stored preset id. */
export function parseThemePatch(input: unknown): { ok: true; patch: Record<string, string | undefined> } | { ok: false; reason: string } {
  if (typeof input === "string") return parseThemePatch({ preset: input });
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: `theme must be an object like {preset, backgroundColor, textColor, accentColor, fontFamily}; presets: ${SLIDE_THEME_PRESET_IDS.join(", ")}.` };
  const raw = input as Record<string, unknown>;
  const patch: Record<string, string | undefined> = {};
  if (raw.preset !== undefined) {
    const preset = parseSlideThemePreset(raw.preset);
    if (!preset) return { ok: false, reason: `Unknown theme preset "${String(raw.preset)}". Use one of: ${SLIDE_THEME_PRESET_IDS.join(", ")}.` };
    Object.assign(patch, themeFromPreset(preset));
  }
  const fields: Array<[string, Parsed<string> | undefined]> = [
    ["backgroundColor", raw.backgroundColor !== undefined ? parseColor(raw.backgroundColor, "theme.backgroundColor") : undefined],
    ["textColor", raw.textColor !== undefined ? parseColor(raw.textColor, "theme.textColor") : undefined],
    ["accentColor", raw.accentColor !== undefined ? parseColor(raw.accentColor, "theme.accentColor") : undefined],
    ["fontFamily", raw.fontFamily !== undefined ? parseFontFamily(raw.fontFamily) : undefined],
  ];
  let explicit = false;
  for (const [key, parsed] of fields) {
    if (!parsed) continue;
    if (!parsed.ok) return parsed;
    patch[key] = parsed.value;
    explicit = true;
  }
  if (explicit && raw.preset === undefined) patch.preset = undefined;
  return Object.keys(patch).length ? { ok: true, patch } : { ok: false, reason: "theme had no preset, backgroundColor, textColor, accentColor or fontFamily." };
}
