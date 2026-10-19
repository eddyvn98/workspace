import { isSafeSlideUrl, sanitizeSlideStyle } from "@/app/workspace/utils/slideHtmlSafety";
import { safeDocColor, safeDocImageUrl, sanitizeDocStyle } from "@/app/workspace/utils/workspaceDocSafety";
// Allowlist sanitizer for HTML the AI writes into docs and slides. Anything
// not listed is dropped; the text inside dropped tags is kept except for
// script-like containers, which are removed with their content.
const BASE_TAGS = new Set([
  "p", "br", "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "strong", "b", "em", "i", "u", "s", "del", "code", "pre", "a", "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col", "div", "span", "hr", "mark", "sub", "sup",
]);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi;
const VOID_TAGS = new Set(["br", "img", "hr", "col"]);
const ATTRS = new Set(["href", "src", "alt", "title", "colspan", "rowspan", "colwidth", "data-type", "data-checked", "data-width", "data-align", "data-workspace-table", "data-table-id", "data-slide-chart", "data-series", "style", "start", "data-line-id", "data-color", "data-download-url", "data-caption", "class"]);

const safeUrl = isSafeSlideUrl;
const safeStyle = sanitizeSlideStyle;

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cleanAttributes(raw: string, allowStyle: boolean, doc: boolean, tag: string): string {
  let out = "";
  for (const match of raw.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const name = match[1].toLowerCase();
    const value = (match[2] ?? match[3] ?? match[4] ?? "").replace(/&(amp|quot|#39|lt|gt);/g, (entity) => ({ "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" }[entity] ?? entity));
    if (!ATTRS.has(name) || name.startsWith("on")) continue;
    if (name === "href" && !safeUrl(value)) continue;
    if (name === "src" && !(doc ? safeDocImageUrl(value) : safeUrl(value))) continue;
    if (name === "data-download-url" && !safeDocImageUrl(value)) continue;
    if (name === "class" && !(tag === "code" && /^language-[\w+-]{1,40}$/.test(value))) continue;
    if (name === "colwidth" && (!/^\d{1,5}(?:,\d{1,5}){0,99}$/.test(value) || value.split(',').some((width) => Number(width) > 10000))) continue;
    if (name === "data-line-id" && !/^[\w:-]{1,200}$/.test(value)) continue;
    if (name === "data-color" && !safeDocColor(value)) continue;
    if (name === "data-align" && !/^(left|center|right)$/.test(value)) continue;
    if (name === "data-width" && !/^(?:1[5-9]|[2-9]\d|100)%$/.test(value)) continue;
    if (name === "style") {
      const style = allowStyle ? safeStyle(value) : doc ? sanitizeDocStyle(value, tag) : "";
      if (style) out += ` style="${escapeAttr(style)}"`;
      continue;
    }
    out += ` ${name}="${escapeAttr(value)}"`;
  }
  return out;
}

export function sanitizeAgentHtml(html: string, options: { allowStyle?: boolean; docAlign?: boolean } = {}): string {
  const allowStyle = options.allowStyle === true;
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "").replace(DROP_WITH_CONTENT, "");
  return stripped.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>?/g, (whole, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase();
    if (!BASE_TAGS.has(tag)) return "";
    if (whole.startsWith("</")) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
    return `<${tag}${cleanAttributes(attrs, allowStyle, options.docAlign === true, tag)}>`;
  }).replace(/<(?=[^a-zA-Z/!])/g, "&lt;");
}

/** Sanitizes the html of every slide in a deck's data (create_block slideDeck). */
export function sanitizeDeckSlides(data: Record<string, unknown>): Record<string, unknown> {
  const slides = data.slides && typeof data.slides === "object" ? data.slides as Record<string, Record<string, unknown>> : null;
  if (!slides) return data;
  return {
    ...data,
    slides: Object.fromEntries(Object.entries(slides).map(([id, slide]) => [id, { ...slide, html: sanitizeAgentHtml(String(slide?.html ?? ""), { allowStyle: true }) }])),
  };
}
