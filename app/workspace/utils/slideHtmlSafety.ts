// Shared allowlist rules for slide HTML: used by the AI-side sanitizer and by the
// client renderers, so stored slides cannot load external resources or overlay the page.
const ALLOWED_PROPERTY = /^(?:color|background-color|font-size|font-weight|font-style|font-family|text-align|line-height|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|width|height|max-width|min-width|min-height|max-height|vertical-align|border(?:-[a-z-]+)?|text-decoration(?:-[a-z]+)?|letter-spacing|list-style(?:-[a-z]+)?)$/;
const FORBIDDEN_VALUE = /\\|url\s*\(|image-set|expression|var\s*\(|javascript|@|<|>|\/\*|behavior|binding|attr\s*\(|env\s*\(|calc\s*\(\s*var/i;
const FORBIDDEN_BORDER_PROPERTY = /^border(?:-[a-z]+)*-(?:image|image-source)$/;

/** Keeps only allowlisted, plain-value declarations of an inline style attribute. */
export function sanitizeSlideStyle(value: string): string {
  const kept: string[] = [];
  for (const declaration of value.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const text = declaration.slice(colon + 1).trim();
    if (!ALLOWED_PROPERTY.test(property) || FORBIDDEN_BORDER_PROPERTY.test(property)) continue;
    if (!text || text.length > 200 || FORBIDDEN_VALUE.test(text)) continue;
    kept.push(`${property}:${text}`);
  }
  return kept.join("; ");
}

/** http(s), mailto, hash and site-relative URLs only; any backslash is refused. */
export function isSafeSlideUrl(value: string): boolean {
  if (value.includes("\\")) return false;
  const url = value.trim().replace(/[\u0000-\u001f\u007f\s]+/g, "");
  return /^(https?:|mailto:|\/|#)/i.test(url) && !/^\/\//.test(url);
}
