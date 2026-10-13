import type { WorkspaceJson } from "./contracts";

const record = (value: unknown): WorkspaceJson =>
  value && typeof value === "object" && !Array.isArray(value) ? value as WorkspaceJson : {};

function mentions(query: string, value: string): boolean {
  const escaped = value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(escaped && new RegExp(`(?<![\\p{L}\\p{N}_-])${escaped}(?![\\p{L}\\p{N}_-])`, "iu").test(query));
}

export function summarizeRuntimeSlides(data: WorkspaceJson, query: string): WorkspaceJson {
  const order = Array.isArray(data.slideOrder) ? data.slideOrder.map(String) : [];
  const slides = record(data.slides);
  const matches = order.filter((id) => {
    const name = String(record(slides[id]).name ?? "");
    return mentions(query, id) || mentions(query, name);
  }).slice(0, 3);
  const included = [...new Set([...matches, ...order])].slice(0, 20);
  return {
    slideCount: order.length,
    slides: included.map((id) => {
      const slide = record(slides[id]);
      const html = String(slide.html ?? "");
      return {
        id, name: String(slide.name ?? id).slice(0, 120),
        ...(matches.includes(id) ? {
          html: html.slice(0, 12_000), htmlTruncated: html.length > 12_000,
          notes: String(slide.presenterNotes ?? slide.notes ?? "").slice(0, 1200),
        } : {}),
      };
    }),
  };
}

export function runtimeSlideGuidance(guidance: string): string {
  const runtimeGuidance = guidance.replace(/To edit one slide exactly, read it first:[\s\S]*?Single-slide commands:/,
    "Read slide IDs and names from board.blocks[].slides; named slides include html, htmlTruncated and notes. Preserve existing content by editing the supplied complete html. If html is missing or htmlTruncated=true, do not rewrite unseen content; explain that the full slide is needed. Rename one slide with update_slide {blockId, slideId, name:<new name>}; newName is only supported inside update_slides[].slides. Single-slide commands:");
  return `Read saved frame IDs, names and order from board.frames. Target one frame by its exact frameId or unique frameName. reorder_frames must list every saved frame ID exactly once. Do not infer frame IDs from block IDs. ${runtimeGuidance}`;
}
