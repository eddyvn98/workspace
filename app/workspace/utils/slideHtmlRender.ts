import { isSafeSlideUrl, sanitizeSlideStyle } from "./slideHtmlSafety";

// Render-time sanitizer for stored slide HTML (present overlay, mini preview,
// thumbnails). It is DOM based and keeps everything the slide editor emits.
const TAGS = new Set([
  "p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "strong", "b", "em", "i", "u", "s", "del", "code", "pre", "a", "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col", "div", "span", "hr", "mark", "sub", "sup", "label", "input",
]);
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript", "link", "meta", "base", "form", "textarea", "select", "button", "video", "audio", "canvas"]);
const ATTRS = new Set(["href", "src", "alt", "title", "colspan", "rowspan", "colwidth", "width", "height", "class", "start", "checked", "type", "disabled", "style"]);
const IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i;

function cleanElement(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    let keep = ATTRS.has(name) || (name.startsWith("data-") && /^[a-z0-9-]+$/.test(name));
    if (name === "href" || name === "src") keep = isSafeSlideUrl(value) || (name === "src" && element.tagName === "IMG" && IMAGE_DATA_URL.test(value.trim()));
    if (name === "type") keep = element.tagName === "INPUT" && value === "checkbox";
    if (name === "style") {
      const style = sanitizeSlideStyle(value);
      if (style) element.setAttribute("style", style); else keep = false;
      if (style) continue;
    }
    if (!keep) element.removeAttribute(attribute.name);
  }
  if (element.tagName === "INPUT") element.setAttribute("disabled", "");
}

function cleanNode(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 8) { node.removeChild(child); continue; }
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    const tag = element.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) { node.removeChild(child); continue; }
    cleanNode(element);
    if (!TAGS.has(tag)) {
      while (element.firstChild) node.insertBefore(element.firstChild, element);
      node.removeChild(element);
      continue;
    }
    cleanElement(element);
  }
}

/** Sanitizes slide HTML for display; falls back to escaped plain text without a DOM. */
export function sanitizeSlideHtmlForRender(html: string): string {
  if (!html) return "";
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>?/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  cleanNode(document.body);
  return document.body.innerHTML;
}
