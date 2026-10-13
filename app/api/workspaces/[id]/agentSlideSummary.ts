import { slideHtmlToText, truncateText } from "@/app/workspace/utils/slideText";
import { normalizeSlideTheme } from "@/app/workspace/utils/slideTheme";
import { slideImageAssets } from "./agent/slideImageAssets";

export const SLIDE_TEXT_LIMIT = 600;
export const SLIDE_NOTES_LIMIT = 300;

/** Compact, read-only view of a slideDeck block's data for the AI: every slide
 *  with its text (headings as "# ", list items as "- "), look and status, plus
 *  the deck settings. The full html is returned by the uncompacted read (view=full), or for
 *  chosen slides only via fullSlideIds (read with ?slideIds=a,b): those get the complete html,
 *  text and notes without paying for the rest of the deck. */
export function compactSlideDeck(data: Record<string, unknown>, options: { fullSlideIds?: ReadonlySet<string> } = {}): Record<string, unknown> {
  const slideRecord = data.slides && typeof data.slides === "object" && !Array.isArray(data.slides)
    ? data.slides as Record<string, unknown>
    : {};
  const slideIds = Array.isArray(data.slideOrder)
    ? data.slideOrder.map(String).filter((slideId) => slideRecord[slideId] !== undefined)
    : Object.keys(slideRecord);
  const theme = normalizeSlideTheme(data.theme);
  return {
    slideIds,
    slides: slideIds.map((slideId, index) => {
      const slide = slideRecord[slideId];
      const item = slide && typeof slide === "object" ? slide as Record<string, unknown> : {};
      const full = options.fullSlideIds?.has(slideId) === true;
      const rawHtml = typeof item.html === "string" ? item.html : "";
      const plain = slideHtmlToText(rawHtml);
      const images = slideImageAssets(rawHtml);
      const text = full ? plain : truncateText(plain, SLIDE_TEXT_LIMIT);
      const rawNotes = typeof item.presenterNotes === "string" && item.presenterNotes.trim() ? item.presenterNotes.trim() : undefined;
      const notes = rawNotes && !full ? truncateText(rawNotes, SLIDE_NOTES_LIMIT) : rawNotes;
      return {
        id: slideId,
        name: item.name ?? item.title ?? `Slide ${index + 1}`,
        ...(full ? { html: rawHtml } : {}),
        htmlText: text,
        ...(images.length ? { images } : {}),
        ...(typeof item.backgroundColor === "string" ? { backgroundColor: item.backgroundColor } : {}),
        ...(notes ? { presenterNotes: notes } : {}),
        ...(typeof item.status === "string" ? { status: item.status } : {}),
        ...(item.hidden === true ? { hidden: true } : {}),
        ...(typeof item.transition === "string" ? { transition: item.transition } : {}),
        ...(typeof item.animation === "string" ? { animation: item.animation } : {}),
      };
    }),
    aspectRatio: data.aspectRatio === "4:3" ? "4:3" : "16:9",
    ...(typeof data.activeSlideId === "string" && slideRecord[data.activeSlideId] !== undefined ? { activeSlideId: data.activeSlideId } : {}),
    ...(typeof data.title === "string" && data.title.trim() ? { deckTitle: data.title.trim() } : {}),
    ...(theme ? { theme } : {}),
    ...(data.showSlideNumbers === true ? { showSlideNumbers: true } : {}),
  };
}
