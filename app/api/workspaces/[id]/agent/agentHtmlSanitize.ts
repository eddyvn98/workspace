import { isSafeSlideUrl, sanitizeSlideStyle } from "@/app/workspace/utils/slideHtmlSafety";
// Allowlist sanitizer for HTML the AI writes into docs and slides. Anything
// not listed is dropped; the text inside dropped tags is kept except for
// script-like containers, which are removed with their content.
const BASE_TAGS = new Set([
  "p", "br", "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "strong", "b", "em", "i", "u", "s", "del", "code", "pre", "a", "img",
  "table", "thead", "tbody", "tr", "th", "td", "div", "span", "hr", "mark", "sub", "sup",
]);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi;
const VOID_TAGS = new Set(["br", "img", "hr"]);
const ATTRS = new Set(["href", "src", "alt", "title", "colspan", "rowspan", "data-type", "data-checked", "data-width", "data-align", "data-workspace-table", "data-table-id", "data-slide-chart", "data-series", "style", "start"]);

const safeUrl = isSafeSlideUrl;
const safeStyle = sanitizeSlideStyle;

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ALIGN_TAGS = new Set(["p", "h1", "h2", "h3", "li", "blockquote"]);

/** Doc blocks keep only `text-align` (the one style the editor schema owns). */
function alignStyle(value: string): string {
  const match = /(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i.exec(value);
  return match ? `text-align: ${match[1].toLowerCase()}` : "";
}

function cleanAttributes(raw: string, allowStyle: boolean, alignTag: boolean): string {
  let out = "";
  for (const match of raw.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const name = match[1].toLowerCase();
    const value = (match[2] ?? match[3] ?? match[4] ?? "").replace(/&(amp|quot|#39|lt|gt);/g, (entity) => ({ "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" }[entity] ?? entity));
    if (!ATTRS.has(name) || name.startsWith("on")) continue;
    if ((name === "href" || name === "src") && !safeUrl(value)) continue;
    if (name === "style") {
      const style = allowStyle ? safeStyle(value) : alignTag ? alignStyle(value) : "";
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
    return `<${tag}${cleanAttributes(attrs, allowStyle, options.docAlign === true && ALIGN_TAGS.has(tag))}>`;
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
