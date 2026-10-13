import { buildSlideLayoutHtml, SLIDE_LAYOUTS, type SlideLayout, type SlideLayoutParams } from "@/app/api/workspaces/[id]/agent/slideLayouts";

export const SLIDE_LAYOUT_LABEL: Record<SlideLayout, string> = {
  title: "Title", "title-bullets": "Title and bullets", "two-column": "Two columns", "image-caption": "Image with caption", section: "Section header", blank: "Blank",
  "data-table": "Data table", "bar-chart": "Bar chart",
  agenda: "Agenda", quote: "Quote", stats: "Big numbers", process: "Process steps", comparison: "Comparison", closing: "Closing",
};

const STARTERS: Record<SlideLayout, SlideLayoutParams> = {
  "data-table": { title: "Data table", columns: ["Item", "Value"], rows: [["Metric", "0"]] },
  "bar-chart": { title: "Bar chart", series: [{ label: "Category A", value: 10 }, { label: "Category B", value: 20 }] },
  title: { title: "Presentation title", subtitle: "Subtitle or presenter" },
  "title-bullets": { title: "Slide title", bullets: ["First point", "Second point", "Third point"] },
  "two-column": { title: "Slide title", left: ["Left point"], right: ["Right point"] },
  "image-caption": { title: "Slide title", caption: "Image caption" },
  section: { title: "Section title", subtitle: "What this section covers" },
  blank: {},
  agenda: { title: "Agenda", bullets: ["Topic one", "Topic two", "Topic three"] },
  quote: { text: "Add a memorable quote here.", author: "Name, role" },
  stats: { title: "Key numbers", items: [{ value: "42%", label: "Metric one" }, { value: "1.2M", label: "Metric two" }, { value: "3x", label: "Metric three" }] },
  process: { title: "How it works", steps: ["First step", "Second step", "Third step"] },
  comparison: { title: "Comparison", leftTitle: "Option A", rightTitle: "Option B", left: ["Pro or fact"], right: ["Pro or fact"] },
  closing: { title: "Thank you", subtitle: "Questions?", bullets: ["name@example.com"] },
};

export const SLIDE_LAYOUT_CHOICES = SLIDE_LAYOUTS.map((layout) => ({ layout, label: SLIDE_LAYOUT_LABEL[layout] }));

/** Starter html and name for a new slide of the given layout (manual "Add slide" picker). */
export function starterSlide(layout: SlideLayout): { html: string; name: string } {
  const params = STARTERS[layout];
  return { html: buildSlideLayoutHtml(layout, params), name: params.title ?? SLIDE_LAYOUT_LABEL[layout] };
}
