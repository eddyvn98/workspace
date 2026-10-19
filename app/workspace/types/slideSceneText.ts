/** Neutral, renderer-independent rich text. No HTML or executable attributes are stored. */
export interface SceneTextStyle {
  bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean;
  color?: string; fontSize?: number; fontFamily?: string; opacity?: number;
}
export interface SceneTextRun extends SceneTextStyle { text: string; }
export interface SceneTextParagraph {
  runs: SceneTextRun[];
  align?: "left" | "center" | "right";
  lineHeight?: number; spaceBefore?: number; spaceAfter?: number;
  bullet?: "none" | "bullet" | "number"; level?: number; start?: number;
}
export interface SceneRichText { version: 1; paragraphs: SceneTextParagraph[]; }
export interface SceneTextDefaults {
  text?: string; richText?: SceneRichText; fontSize?: number; fontFamily?: string;
  fontWeight?: "normal" | "bold"; color?: string; italic?: boolean; underline?: boolean;
  strike?: boolean; align?: "left" | "center" | "right"; opacity?: number;
  verticalAlign?: "top" | "middle" | "bottom";
}
export const MAX_SCENE_TEXT_CHARS = 10000;
export const MAX_SCENE_TEXT_RUNS = 1024;
export const MAX_SCENE_PARAGRAPHS = 200;
const record = (v: unknown): Record<string, unknown> | undefined => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export function sceneTextColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (/^#[a-f0-9]{6}$/i.test(value)) return value.toUpperCase();
  if (/^#[a-f0-9]{3}$/i.test(value)) return "#" + value.slice(1).split("").map(v => v + v).join("").toUpperCase();
  return undefined;
}
export function normalizeSceneTextStyle(input: unknown): SceneTextStyle | undefined {
  const raw = record(input); if (!raw) return undefined;
  const output: SceneTextStyle = {};
  for (const key of ["bold", "italic", "underline", "strike"] as const) {
    if (raw[key] === undefined || raw[key] === null) continue;
    if (typeof raw[key] !== "boolean") return undefined;
    output[key] = raw[key];
  }
  if (raw.color != null) { const value = sceneTextColor(raw.color); if (!value) return undefined; output.color = value; }
  if (raw.fontFamily != null) {
    if (typeof raw.fontFamily !== "string" || !/^[\w\s,'"-]{1,100}$/.test(raw.fontFamily)) return undefined;
    output.fontFamily = raw.fontFamily;
  }
  for (const [key, min, max] of [["fontSize", 8, 180], ["opacity", 0, 1]] as const) {
    if (raw[key] == null) continue;
    if (!finite(raw[key]) || raw[key] < min || raw[key] > max) return undefined;
    output[key] = raw[key];
  }
  return output;
}
export function normalizeSceneRichText(input: unknown): SceneRichText | undefined {
  const raw = record(input);
  if (raw?.version !== 1 || !Array.isArray(raw.paragraphs) || !raw.paragraphs.length || raw.paragraphs.length > MAX_SCENE_PARAGRAPHS) return undefined;
  const paragraphs: SceneTextParagraph[] = []; let runCount = 0, characters = raw.paragraphs.length - 1;
  for (const value of raw.paragraphs) {
    const p = record(value);
    if (!p || !Array.isArray(p.runs) || (runCount += p.runs.length) > MAX_SCENE_TEXT_RUNS) return undefined;
    const runs: SceneTextRun[] = [];
    for (const value of p.runs) {
      const run = record(value), style = normalizeSceneTextStyle(value);
      if (!run || typeof run.text !== "string" || !style) return undefined;
      characters += run.text.length; if (characters > MAX_SCENE_TEXT_CHARS) return undefined;
      const text = run.text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
      const previous = runs[runs.length - 1];
      if (previous && JSON.stringify({ ...previous, text: "" }) === JSON.stringify({ text: "", ...style })) previous.text += text;
      else runs.push({ text, ...style });
    }
    const paragraph: SceneTextParagraph = { runs: runs.length ? runs : [{ text: "" }] };
    if (p.align != null) { if (!["left", "center", "right"].includes(String(p.align))) return undefined; paragraph.align = p.align as SceneTextParagraph["align"]; }
    if (p.bullet != null) { if (!["none", "bullet", "number"].includes(String(p.bullet))) return undefined; paragraph.bullet = p.bullet as SceneTextParagraph["bullet"]; }
    for (const [key, min, max] of [["lineHeight", 0.8, 3], ["spaceBefore", 0, 300], ["spaceAfter", 0, 300], ["level", 0, 8], ["start", 1, 9999]] as const) {
      if (p[key] == null) continue;
      if (!finite(p[key]) || p[key] < min || p[key] > max || ((key === "level" || key === "start") && !Number.isInteger(p[key]))) return undefined;
      paragraph[key] = p[key];
    }
    paragraphs.push(paragraph);
  }
  const result: SceneRichText = { version: 1, paragraphs };
  return sceneRichTextPlainText(result).length <= MAX_SCENE_TEXT_CHARS ? result : undefined;
}
export function sceneParagraphLabels(rich: SceneRichText): string[] {
  const counters = new Map<number, number>();
  return rich.paragraphs.map(p => {
    if (!p.bullet || p.bullet === "none") { counters.clear(); return ""; }
    if (p.bullet === "bullet") return "\u2022";
    const level = p.level ?? 0;
    for (const key of counters.keys()) if (key > level) counters.delete(key);
    const value = p.start ?? ((counters.get(level) ?? 0) + 1); counters.set(level, value);
    return `${value}.`;
  });
}
export function sceneRichTextPlainText(rich: SceneRichText): string {
  const labels = sceneParagraphLabels(rich);
  return rich.paragraphs.map((p, i) => (labels[i] ? labels[i] + " " : "") + p.runs.map(run => run.text).join("")).join("\n");
}
export function richTextFromObject(object: SceneTextDefaults): SceneRichText {
  return object.richText ?? { version: 1, paragraphs: (object.text ?? "").split("\n").map(text => ({ runs: [{ text }] })) };
}
export function resolvedSceneTextStyle(object: SceneTextDefaults, run: SceneTextStyle = {}): Required<SceneTextStyle> {
  return { bold: run.bold ?? object.fontWeight === "bold", italic: run.italic ?? object.italic ?? false,
    underline: run.underline ?? object.underline ?? false, strike: run.strike ?? object.strike ?? false,
    fontSize: run.fontSize ?? object.fontSize ?? 44, fontFamily: run.fontFamily ?? object.fontFamily ?? "Arial",
    color: run.color ?? object.color ?? "#0F172A", opacity: run.opacity ?? 1 };
}
/** Explicit whole-box formatting changes override the matching run/paragraph overrides, not the text. */
export function inheritSceneTextStyle(rich: SceneRichText, patch: Partial<SceneTextDefaults>): SceneRichText {
  const keys: (keyof SceneTextStyle)[] = [];
  for (const key of ["fontSize", "fontFamily", "color", "italic", "underline", "strike"] as const) if (Object.hasOwn(patch, key)) keys.push(key);
  if (Object.hasOwn(patch, "fontWeight")) keys.push("bold");
  if (!keys.length && !Object.hasOwn(patch, "align")) return rich;
  return { ...rich, paragraphs: rich.paragraphs.map(p => {
    const next = { ...p, runs: p.runs.map(run => { const next = { ...run }; for (const key of keys) delete next[key]; return next; }) };
    if (Object.hasOwn(patch, "align")) delete next.align;
    return next;
  }) };
}
export function scaleSceneRichText(rich: SceneRichText, factor: number): SceneRichText {
  if (!Number.isFinite(factor) || factor <= 0) return rich;
  return { ...rich, paragraphs: rich.paragraphs.map(p => ({ ...p,
    ...(p.spaceBefore !== undefined ? { spaceBefore: Math.min(300, p.spaceBefore * factor) } : {}),
    ...(p.spaceAfter !== undefined ? { spaceAfter: Math.min(300, p.spaceAfter * factor) } : {}),
    runs: p.runs.map(run => ({ ...run, ...(run.fontSize !== undefined ? { fontSize: Math.max(8, Math.min(180, run.fontSize * factor)) } : {}) })),
  })) };
}
export function sceneTextSignature(object: SceneTextDefaults): string {
  const { text, richText, fontSize, fontFamily, fontWeight, color, italic, underline, strike, align, verticalAlign } = object;
  return JSON.stringify({ text, richText, fontSize, fontFamily, fontWeight, color, italic, underline, strike, align, verticalAlign });
}
