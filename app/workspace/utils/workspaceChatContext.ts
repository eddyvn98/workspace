import { resolveTransform, type CanvasBlock } from "../types/block";
import { slideHtmlToText, truncateText } from "./slideText";
import { buildTableMeta } from "./tableMeta";

export interface SelectedBlocksContext {
  summaryLabels: string[];
  contextPrompt: string;
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

export function extractBlockLabel(block: CanvasBlock): string {
  const d = block.data as Record<string, unknown>;
  if (block.type === "text" && typeof d.markdown === "string") {
    const clean = d.markdown.replace(/\n+/g, " ").trim();
    return clean.length > 40 ? `${clean.slice(0, 37)}…` : clean;
  }
  if (block.type === "shape") {
    const label = slideHtmlToText(stringField(d, "label") || "").replace(/\s+/g, " ").trim();
    return truncateText(label, 40) || stringField(d, "shapeKind") || "Shape";
  }
  if (block.type === "image") {
    return stringField(d, "alt") || "Image";
  }
  if (block.type === "link") {
    return stringField(d, "title") || stringField(d, "url") || "Link";
  }
  if (block.type === "table") {
    const rows = typeof d.rows === "number" ? d.rows : 2;
    const cols = typeof d.cols === "number" ? d.cols : 2;
    return `Table (${rows}x${cols})`;
  }
  if (block.type === "path") {
    return "Drawing Stroke";
  }
  return stringField(d, "label") || stringField(d, "title") || stringField(d, "markdown") || block.type;
}

/** Compact deck summary (slide text, notes, status) instead of dumping every slide's raw HTML. */
function describeSlideDeck(d: Record<string, unknown>): string {
  const slides = d.slides && typeof d.slides === "object" ? d.slides as Record<string, Record<string, unknown>> : {};
  const order = Array.isArray(d.slideOrder) ? d.slideOrder.map(String).filter((id) => slides[id]) : Object.keys(slides);
  const parts = order.map((id, index) => {
    const slide = slides[id];
    const text = truncateText(slideHtmlToText(String(slide.html ?? "")).replace(/\n/g, " / "), 300);
    const notes = typeof slide.presenterNotes === "string" && slide.presenterNotes.trim() ? ` notes="${truncateText(slide.presenterNotes.trim(), 120)}"` : "";
    const flags = [typeof slide.status === "string" ? `status=${slide.status}` : "", slide.hidden === true ? "hidden" : "", typeof slide.backgroundColor === "string" ? `background=${slide.backgroundColor}` : ""].filter(Boolean).join(", ");
    return `[${index + 1}] slideId=${id} name="${String(slide.name ?? "")}"${flags ? ` (${flags})` : ""}: ${text || "(empty)"}${notes}`;
  });
  return `Slide deck aspectRatio=${d.aspectRatio === "4:3" ? "4:3" : "16:9"}, activeSlideId=${String(d.activeSlideId ?? order[0] ?? "")}${d.theme ? `, theme=${JSON.stringify(d.theme)}` : ""}${d.showSlideNumbers === true ? ", slideNumbers=on" : ""}; slides: ${parts.join(" || ")}`;
}

export function formatSelectedBlocksContext(
  selectedBlockIds: string[],
  blocks: Record<string, CanvasBlock>
): SelectedBlocksContext {
  const selectedBlocks = selectedBlockIds
    .map((id) => blocks[id])
    .filter((b): b is CanvasBlock => Boolean(b));

  if (selectedBlocks.length === 0) {
    return { summaryLabels: [], contextPrompt: "" };
  }

  const summaryLabels = selectedBlocks.map(extractBlockLabel);
  const duplicateLabels = new Set(
    selectedBlocks
      .map(extractBlockLabel)
      .filter((label) => Object.values(blocks).filter((candidate) => extractBlockLabel(candidate) === label).length > 1),
  );

  const positionOf = (block: CanvasBlock) => resolveTransform(
    block.transform,
    { x: 0, y: 0, w: 160, h: 80, rotation: 0, zIndex: 0 },
  );

  const blockDetails = selectedBlocks.map((b, idx) => {
    const d = b.data as Record<string, unknown>;
    let content = "";
    if (b.type === "text") {
      content = `Text: "${stringField(d, "markdown") || ""}"`;
    } else if (b.type === "shape") {
      const label = stringField(d, "label");
      content = `Shape kind=${stringField(d, "shapeKind") || "rectangle"}${label ? `, label="${label}"` : ""}`;
    } else if (b.type === "image") {
      const alt = stringField(d, "alt");
      content = `Image url="${stringField(d, "url") || ""}" ${alt ? `alt="${alt}"` : ""}`;
    } else if (b.type === "link") {
      const title = stringField(d, "title");
      content = `Link url="${stringField(d, "url") || ""}" ${title ? `title="${title}"` : ""}`;
    } else if (b.type === "table" && Array.isArray(d.cells)) {
      content = `Table cells=${JSON.stringify(d.cells)} meta=${JSON.stringify(buildTableMeta(d))}`;
    } else if (b.type === "path") {
      content = `Freehand path (points count: ${Array.isArray(d.points) ? d.points.length : 0})`;
    } else if (b.type === "slideDeck") {
      content = describeSlideDeck(d);
    } else {
      content = JSON.stringify(d);
    }
    // `description` is a block-level field independent of `data`/type (see
    // CanvasBlock), so it was silently dropped for every block type here —
    // the model was never shown it, and so could never act on it: a
    // "translate this" request translated the title and left the
    // description exactly as it was, reported as a complete translation.
    const description = typeof b.description === "string" && b.description.trim() ? b.description.trim() : "";
    // Found live: with no existing-children context, "develop this node
    // further" duplicated siblings that already existed under it (a new
    // "Team pairing" node next to an existing "Registration & pairing" one,
    // a new "Mentorship program" next to an existing "Mentorship & tools"
    // one) — the model had no way to know they were already there. Listing
    // direct children only (not the whole subtree) keeps this scoped to what
    // "expand this node" actually needs to not collide with.
    const existingChildren = Object.values(blocks).filter((candidate) => candidate.parentId === b.id);
    const childList = existingChildren.length > 0
      ? ` | already has ${existingChildren.length} sub-block(s): ${existingChildren.map((child) => `"${extractBlockLabel(child)}"`).join(", ")} — do not recreate or duplicate these`
      : "";
    const transform = positionOf(b);
    const spatialPosition = ` | canvas position: x=${transform.x}, y=${transform.y}, width=${transform.w}, height=${transform.h}`;
    const duplicateCandidates = duplicateLabels.has(extractBlockLabel(b))
      ? Object.values(blocks)
          .filter((candidate) => extractBlockLabel(candidate) === extractBlockLabel(b))
          .map((candidate) => {
            const rect = positionOf(candidate);
            return `${candidate.id} at x=${rect.x}, y=${rect.y}`;
          })
          .join("; ")
      : "";
    const duplicates = duplicateCandidates ? ` | same-label candidates: ${duplicateCandidates}` : "";
    return `- Block ${idx + 1} (id: ${b.id}, type: ${b.type}): ${content}${spatialPosition}${duplicates}${description ? ` | description: "${description}"` : ""}${childList}`;
  });

  const contextPrompt = `\n\n[Context: The user currently has ${selectedBlocks.length} block(s) selected on the workspace canvas:\n${blockDetails.join("\n")}\nResolve targets by real block ID. Treat explicit spatial words such as upper/lower/above/below as constraints and compare canvas y-coordinates (smaller y is higher); selection alone must not override a conflicting spatial constraint. If the requested position and selected block disagree or cannot be determined from the available blocks, ask which block to change before mutating.]`;

  return { summaryLabels, contextPrompt };
}
