import { slideHtmlToText } from "./slideText";

interface DeckData {
  title?: string;
  slideOrder?: string[];
  slides?: Record<string, { name?: string; html?: string; presenterNotes?: string; hidden?: boolean; status?: string }>;
  aspectRatio?: string;
}

/** One-line label for a slide deck block in the markdown outline. */
export function slideDeckLabel(data: unknown): string {
  const deck = (data ?? {}) as DeckData;
  const count = (deck.slideOrder ?? Object.keys(deck.slides ?? {})).length;
  return `Slide deck${deck.title ? `: ${deck.title}` : ""} (${count} slide${count === 1 ? "" : "s"}, ${deck.aspectRatio === "4:3" ? "4:3" : "16:9"})`;
}

/** Markdown sections for a deck: "## n. name" per slide, the slide text
 *  (body headings shown in bold so they do not clash with the section
 *  headings, lists kept as lists) and presenter notes as a blockquote. */
export function renderSlideDeckMarkdown(data: unknown): string {
  const deck = (data ?? {}) as DeckData;
  const slides = deck.slides ?? {};
  const order = (deck.slideOrder ?? Object.keys(slides)).filter((id) => slides[id]);
  return order.map((id, index) => {
    const slide = slides[id];
    const body = slideHtmlToText(String(slide.html ?? ""))
      .split("\n")
      .map((line) => line.replace(/^#{1,6}\s+(.*)$/, "**$1**"))
      .join("\n");
    const flags = [slide.hidden ? "hidden" : "", slide.status ? slide.status.replace(/_/g, " ") : ""].filter(Boolean);
    const notes = slide.presenterNotes?.trim()
      ? slide.presenterNotes.trim().split(/\r?\n/).map((line) => `> ${line}`).join("\n")
      : "";
    return [`## ${index + 1}. ${slide.name || `Slide ${index + 1}`}${flags.length ? ` (${flags.join(", ")})` : ""}`, body, notes && `> Presenter notes:\n${notes}`]
      .filter(Boolean)
      .join("\n\n");
  }).join("\n\n");
}
