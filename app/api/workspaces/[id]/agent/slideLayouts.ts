// Server-side slide layouts: each layout expands to an HTML skeleton that
// uses only tags the slide editor (TipTap StarterKit + TableKit + DocImage)
// keeps: headings, paragraphs, lists, tables and images.
import { buildSlideDataHtml, type SlideDataParams } from "./slideDataLayouts";

export const SLIDE_LAYOUTS = [
  "title", "title-bullets", "two-column", "image-caption", "section", "blank",
  "agenda", "quote", "stats", "process", "comparison", "closing", "data-table", "bar-chart",
] as const;
export type SlideLayout = typeof SLIDE_LAYOUTS[number];

export interface SlideLayoutParams extends SlideDataParams {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  left?: string[];
  right?: string[];
  imageUrl?: string;
  caption?: string;
  /** stats: big-number cards. */
  items?: Array<{ value: string; label: string }>;
  /** process: ordered steps. */
  steps?: string[];
  /** comparison: column headings. */
  leftTitle?: string;
  rightTitle?: string;
  /** quote: the quotation and who said it. */
  text?: string;
  author?: string;
}

export const STATS_MIN = 2;
export const STATS_MAX = 4;
export const PROCESS_MIN = 2;
export const PROCESS_MAX = 6;

export const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function parseSlideLayout(input: unknown): SlideLayout | undefined {
  const normalized = String(input ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return (SLIDE_LAYOUTS as readonly string[]).includes(normalized) ? normalized as SlideLayout : undefined;
}

/** Accepts [{value,label}] or "value | label" strings. */
export function statItems(input: unknown): Array<{ value: string; label: string }> {
  const items = Array.isArray(input) ? input : typeof input === "string" ? input.split(/\r?\n/) : [];
  return items.flatMap((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const value = String(record.value ?? record.number ?? "").trim();
      return value ? [{ value, label: String(record.label ?? record.text ?? "").trim() }] : [];
    }
    const [value, ...rest] = String(item ?? "").split("|");
    return value.trim() ? [{ value: value.trim(), label: rest.join("|").trim() }] : [];
  });
}

/** Accepts an array of strings or one newline-separated string. */
export function stringList(input: unknown): string[] {
  const items = Array.isArray(input) ? input : typeof input === "string" ? input.split(/\r?\n/) : [];
  return items.map((item) => String(item).replace(/^\s*[-*•]\s+/, "").trim()).filter(Boolean);
}

const heading = (level: 1 | 2, text: string | undefined) => (text ? `<h${level}>${escapeHtml(text)}</h${level}>` : "");
const paragraph = (text: string | undefined) => (text ? `<p>${escapeHtml(text)}</p>` : "");
const list = (items: string[] | undefined) => (items?.length ? `<ul>${items.map((item) => `<li><p>${escapeHtml(item)}</p></li>`).join("")}</ul>` : "");
const cell = (items: string[] | undefined) => `<td>${list(items) || "<p></p>"}</td>`;
const row = (cells: string[]) => `<table><tbody><tr>${cells.join("")}</tr></tbody></table>`;
export const safeSlideImageUrl = (url: string | undefined) => (url && !url.includes("\\") && /^(https?:\/\/|\/(?![\/\\]))/i.test(url.trim()) ? url.trim() : undefined);

export function buildSlideLayoutHtml(layout: SlideLayout, params: SlideLayoutParams): string {
  switch (layout) {
    case "data-table":
    case "bar-chart":
      return buildSlideDataHtml(layout, params.title, params);
    case "title":
      return `${heading(1, params.title)}${paragraph(params.subtitle ?? params.caption)}`;
    case "section":
      return `${heading(1, params.title)}<hr>${paragraph(params.subtitle ?? params.caption)}`;
    case "title-bullets":
      return `${heading(2, params.title)}${list(params.bullets)}`;
    case "two-column":
      return `${heading(2, params.title)}<table><tbody><tr>${cell(params.left)}${cell(params.right)}</tr></tbody></table>`;
    case "image-caption": {
      const url = safeSlideImageUrl(params.imageUrl);
      return `${heading(2, params.title)}${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(params.caption ?? params.title ?? "")}">` : ""}${paragraph(params.caption)}`;
    }
    case "agenda":
      return `${heading(2, params.title ?? "Agenda")}${params.bullets?.length ? `<ol>${params.bullets.map((item) => `<li><p>${escapeHtml(item)}</p></li>`).join("")}</ol>` : ""}`;
    case "quote":
      return `${params.text ? `<blockquote><p>${escapeHtml(params.text)}</p></blockquote>` : ""}${paragraph(params.author ? `\u2014 ${params.author}` : undefined)}`;
    case "stats":
      return `${heading(2, params.title)}${row((params.items ?? []).slice(0, STATS_MAX).map((item) => `<td><h1>${escapeHtml(item.value)}</h1>${paragraph(item.label)}</td>`))}`;
    case "process":
      return `${heading(2, params.title)}${row((params.steps ?? []).slice(0, PROCESS_MAX).map((step, index) => `<td><h3>${index + 1}</h3>${paragraph(step)}</td>`))}`;
    case "comparison":
      return `${heading(2, params.title)}<table><tbody><tr><th>${escapeHtml(params.leftTitle ?? "")}</th><th>${escapeHtml(params.rightTitle ?? "")}</th></tr><tr>${cell(params.left)}${cell(params.right)}</tr></tbody></table>`;
    case "closing":
      return `${heading(1, params.title ?? "Thank you")}${paragraph(params.subtitle ?? params.caption)}${params.bullets?.map((line) => paragraph(line)).join("") ?? ""}`;
    default:
      return "";
  }
}
