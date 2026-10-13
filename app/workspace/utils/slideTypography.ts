// Slide typography: every size is a container-query unit (cqw = 1% of the
// slide container width), so the same stored HTML reads well in the editor,
// the filmstrip thumbnails and Present mode. `.slide-cq` is the container;
// `.slide-html` marks the read-only renderers (the editor uses `.ProseMirror`).
const ROOTS = [".slide-cq.slide-cq .ProseMirror", ".slide-cq.slide-cq .slide-html"];

const RULES: Array<[string, string]> = [
  ["", "font-size: 2.4cqw; line-height: 1.45;"],
  ["h1", "font-size: 5.6cqw; line-height: 1.12; font-weight: 800; letter-spacing: -0.01em; margin: 0.2em 0 0.25em; color: var(--slide-accent);"],
  ["h2", "font-size: 3.8cqw; line-height: 1.2; font-weight: 700; margin: 0 0 0.5em;"],
  ["h3", "font-size: 2.8cqw; line-height: 1.25; font-weight: 700; margin: 0.6em 0 0.25em;"],
  ["p", "margin: 0.35em 0;"],
  ["ul, ol", "margin: 0.4em 0; padding-left: 1.6em;"],
  ["li", "margin: 0.3em 0; font-size: 2.6cqw;"],
  ["li p", "margin: 0;"],
  ["hr", "border: 0; border-top: 0.45cqw solid var(--slide-accent); width: 12cqw; margin: 1.2cqw 0;"],
  ["blockquote", "border-left: 0.6cqw solid var(--slide-accent); margin: 1.2cqw 0; padding: 0.4cqw 0 0.4cqw 2cqw; font-size: 3.4cqw; line-height: 1.35; font-style: italic; color: inherit;"],
  ["table", "width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 1.4cqw 0; margin: 1.2cqw -1.4cqw;"],
  ["td, th", "border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 0.8cqw; padding: 1.4cqw 1.6cqw; vertical-align: top;"],
  ["th", "background: color-mix(in srgb, var(--slide-accent) 14%, transparent); color: var(--slide-accent); font-size: 2.8cqw; font-weight: 700; text-align: left;"],
  // Big-number cards (stats layout) and numbered steps (process layout).
  ["td:has(> h1)", "text-align: center;"],
  ["td h1", "font-size: 6.4cqw; line-height: 1.05; margin: 0.1em 0 0.15em; color: var(--slide-accent);"],
  ["td:has(> h1) p", "font-size: 2.2cqw; opacity: 0.8; margin: 0;"],
  ["td h3", "font-size: 3.4cqw; line-height: 1; margin: 0 0 0.4em; color: var(--slide-accent);"],
  ["img", "max-width: 100%; max-height: 60%; border-radius: 0.8cqw;"],
  ["a", "color: var(--slide-accent);"],
];

function selectorFor(selector: string): string {
  const parts = selector ? selector.split(",").map((part) => part.trim()) : [""];
  return ROOTS.flatMap((root) => parts.map((part) => (part ? `${root} ${part}` : root))).join(", ");
}

/** Stylesheet text for `.slide-cq` containers; render once next to the surface. */
export const SLIDE_TYPOGRAPHY_CSS = [
  ".slide-cq { container-type: inline-size; }",
  ...RULES.map(([selector, body]) => `${selectorFor(selector)} { ${body} }`),
].join("\n");
