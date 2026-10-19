import { attrValue, nodeText, parseHtml, type HtmlNode } from "@/app/api/workspaces/[id]/agent/docHtmlParse";
import { parseSlideChart } from "@/app/workspace/utils/slideChart";
import type { SlideMeta, SlideTheme } from "@/app/workspace/types/slide";

export type SlideElement = { kind: "text"; text: string; heading: boolean } | { kind: "table"; rows: string[][] } | { kind: "image"; src: string; alt: string } | { kind: "chart"; series: { label: string; value: number }[] };
export type ExportSlide = { slide: SlideMeta; theme: SlideTheme; elements: SlideElement[]; width: number };
const record = (v: unknown): Record<string, any> => v && typeof v === "object" ? v as Record<string, any> : {};

export function slideElements(html: string): SlideElement[] {
  if (html.length > 120_000) throw new Error("A slide contains too much content to export.");
  const result: SlideElement[] = [];
  const visit = (node: HtmlNode) => {
    const chart = attrValue(node, "data-slide-chart");
    if (chart) {
      const series = parseSlideChart(attrValue(node, "data-series"));
      if (!series.length) throw new Error("A chart has invalid persisted data.");
      result.push({ kind: "chart", series }); return;
    }
    if (node.tag === "table") {
      const rows: string[][] = [];
      const collect = (n: HtmlNode) => {
        if (n.tag === "tr") { rows.push(n.children.filter((c) => c.tag === "td" || c.tag === "th").map(nodeText)); return; }
        n.children.forEach(collect);
      };
      collect(node);
      if (rows.length) result.push({ kind: "table", rows });
      const images = (n: HtmlNode) => { if (n.tag === "img") visit(n); else n.children.forEach(images); };
      node.children.forEach(images); return;
    }
    if (node.tag === "img") {
      result.push({ kind: "image", src: attrValue(node, "src") ?? "", alt: attrValue(node, "alt") ?? "Image" }); return;
    }
    if (["h1", "h2", "h3", "p", "li", "blockquote"].includes(node.tag)) {
      const text = nodeText(node).trim();
      if (text) result.push({ kind: "text", text: `${node.tag === "li" ? "• " : ""}${text}`, heading: node.tag.startsWith("h") });
      const images = (n: HtmlNode) => { if (n.tag === "img") visit(n); else n.children.forEach(images); };
      node.children.forEach(images); return;
    }
    if (node.tag === "#text") {
      const text = nodeText(node).trim(); if (text) result.push({ kind: "text", text, heading: false }); return;
    }
    node.children.forEach(visit);
  };
  parseHtml(html).forEach(visit);
  if (result.length > 200) throw new Error("A slide has too many objects to export.");
  return result;
}

export function boardExportSlides(board: { blocks: unknown; blockOrder: unknown }, ids?: unknown): ExportSlide[] {
  const raw = record(board.blocks), blocks = Array.isArray(board.blocks) ? Object.fromEntries(board.blocks.map((b) => [b.id, b])) : raw;
  const selected = ids === undefined ? (Array.isArray(board.blockOrder) ? board.blockOrder : Object.keys(blocks)) : ids;
  if (!Array.isArray(selected) || selected.some((id) => typeof id !== "string" || !blocks[id])) throw new Error("blockIds must identify existing blocks.");
  const output: ExportSlide[] = [];
  for (const id of new Set(selected)) {
    const b = blocks[id]; if (b.type !== "slideDeck") { if (ids !== undefined) throw new Error("PowerPoint export accepts slide decks only."); continue; }
    const data = record(b.data), slides = record(data.slides);
    for (const slideId of Array.isArray(data.slideOrder) ? data.slideOrder : Object.keys(slides)) {
      const s = slides[slideId]; if (!s || s.hidden) continue;
      output.push({ slide: s, theme: record(data.theme), width: data.aspectRatio === "4:3" ? 960 : 1280, elements: s.scene ? [] : slideElements(String(s.html ?? "")) });
    }
  }
  if (!output.length || output.length > 60) throw new Error("Select decks containing between 1 and 60 visible slides.");
  if (output.some((s) => s.width !== output[0].width)) throw new Error("Selected decks must use the same aspect ratio.");
  return output;
}
