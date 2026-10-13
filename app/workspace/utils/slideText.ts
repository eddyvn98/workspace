const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** Plain-text rendering of a slide's HTML body that keeps structure:
 *  headings as "# Title", list items as "- item", table cells joined by " | ". */
export function slideHtmlToText(html: string): string {
  const text = String(html ?? "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_m, _tag, inner: string) => `${inner.replace(/<\/?p\b[^>]*>/gi, " ")} | `)
    .replace(/<h([1-6])\b[^>]*>/gi, (_m, level: string) => `\n${"#".repeat(Number(level))} `)
    .replace(/<\/h[1-6]\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<img\b[^>]*>/gi, " [image] ")
    .replace(/<\/(p|div|tr|ul|ol|blockquote|table)\s*>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\|\s*(?=\n|$)/g, "")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n");
  return text.trim();
}

export function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}
