import type { BlockId, CanvasBlock } from "../types/block";
import {
  createBlockId,
  createComputedTransform,
} from "../types/block";
import type { CanvasConnector } from "../types/connector";
import { createConnectorId } from "../types/connector";
import { computeTreeLayout, type TreeLayoutSize } from "../layout/treeLayout";

const NEW_NODE_SIZE = { w: 170, h: 36 };

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;");
}

export interface OpmlExportResult {
  opml: string;
  exportedCount: number;
  skippedCount: number;
  totalCount: number;
}

function renderNode(
  blockId: BlockId,
  depth: number,
  visited: Set<BlockId>,
  blocks: Record<BlockId, CanvasBlock>,
  childrenByParent: Map<BlockId, BlockId[]>
): string {
  if (visited.has(blockId)) return "";
  visited.add(blockId);

  const block = blocks[blockId];
  if (!block) return "";

  const text =
    block.type === "text" && block.data && typeof (block.data as { markdown?: string }).markdown === "string"
      ? (block.data as { markdown: string }).markdown
      : "";

  const children = (childrenByParent.get(blockId) ?? []).filter((id) => !visited.has(id));
  const indent = "  ".repeat(depth);
  const escapedText = escapeXml(text);

  if (children.length === 0) {
    return `${indent}<outline text="${escapedText}" />\n`;
  }

  let xml = `${indent}<outline text="${escapedText}">\n`;
  for (const childId of children) {
    xml += renderNode(childId, depth + 1, visited, blocks, childrenByParent);
  }
  xml += `${indent}</outline>\n`;
  return xml;
}

/**
 * Exports tree-structured blocks to OPML 2.0 XML string with statistics.
 * Free-floating blocks (not part of any parent-child tree) are skipped.
 */
export function exportToOpmlWithStats(
  blocks: Record<BlockId, CanvasBlock>,
  title = "Workspace Outline"
): OpmlExportResult {
  const allBlocks = Object.values(blocks);
  const totalCount = allBlocks.length;
  const childrenByParent = new Map<BlockId, BlockId[]>();

  for (const block of allBlocks) {
    if (block.parentId && blocks[block.parentId]) {
      const list = childrenByParent.get(block.parentId) ?? [];
      list.push(block.id);
      childrenByParent.set(block.parentId, list);
    }
  }

  // A root is a block with no valid parent in blocks, but having at least 1 child.
  const roots = allBlocks.filter(
    (b) => (!b.parentId || !blocks[b.parentId]) && (childrenByParent.get(b.id)?.length ?? 0) > 0
  );

  const visited = new Set<BlockId>();
  let bodyXml = "";

  for (const root of roots) {
    bodyXml += renderNode(root.id, 2, visited, blocks, childrenByParent);
  }

  const exportedCount = visited.size;
  const skippedCount = Math.max(0, totalCount - exportedCount);

  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(title)}</title>
  </head>
  <body>
${bodyXml}  </body>
</opml>`;

  return {
    opml,
    exportedCount,
    skippedCount,
    totalCount,
  };
}

/**
 * Pure OPML export function conforming to CONTRACTS.md §27.
 */
export function exportToOpml(blocks: Record<BlockId, CanvasBlock>, title?: string): string {
  return exportToOpmlWithStats(blocks, title).opml;
}

/**
 * Parses OPML XML string and produces tree-structured CanvasBlocks with auto-connectors,
 * arranged using computeTreeLayout.
 */
export function importFromOpml(xml: string): {
  blocks: CanvasBlock[];
  connectors: CanvasConnector[];
  skippedCount: number;
} {
  if (typeof window === "undefined" && typeof DOMParser === "undefined") {
    return { blocks: [], connectors: [], skippedCount: 0 };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error(`OPML parsing error: ${parserError.textContent ?? "Invalid XML"}`);
  }

  const body = doc.querySelector("body") ?? doc.getElementsByTagName("body")[0] ?? doc.documentElement;
  if (!body) {
    return { blocks: [], connectors: [], skippedCount: 0 };
  }

  const rootElements: Element[] = [];
  let skippedCount = 0;

  for (let i = 0; i < body.children.length; i++) {
    const child = body.children[i];
    const tagName = (child.localName ?? child.tagName ?? "").toLowerCase();
    if (tagName === "outline") {
      rootElements.push(child);
    } else if (tagName !== "head") {
      skippedCount++;
    }
  }

  const allBlocks: CanvasBlock[] = [];
  const allConnectors: CanvasConnector[] = [];
  let currentRootY = 0;

  for (const rootEl of rootElements) {
    const treeBlocks: CanvasBlock[] = [];
    const childrenByParent = new Map<BlockId, BlockId[]>();
    const sizes = new Map<BlockId, TreeLayoutSize>();

    function processOutline(el: Element, parentId?: BlockId): BlockId {
      const id = createBlockId();
      const markdown =
        el.getAttribute("text") ??
        el.getAttribute("title") ??
        el.getAttribute("_text") ??
        "";
      const now = Date.now();
      const block: CanvasBlock<"text"> = {
        id,
        type: "text",
        transform: createComputedTransform({
          ...NEW_NODE_SIZE,
          x: 0,
          y: 0,
          rotation: 0,
          zIndex: 0,
        }),
        data: { markdown },
        parentId,
        createdAt: now,
        updatedAt: now,
      };
      treeBlocks.push(block);
      sizes.set(id, { w: NEW_NODE_SIZE.w, h: NEW_NODE_SIZE.h });

      if (parentId) {
        const sibs = childrenByParent.get(parentId) ?? [];
        sibs.push(id);
        childrenByParent.set(parentId, sibs);

        allConnectors.push({
          id: createConnectorId(),
          fromBlockId: parentId,
          toBlockId: id,
          lineType: "curved",
        });
      }

      for (let j = 0; j < el.children.length; j++) {
        const child = el.children[j];
        const childTag = (child.localName ?? child.tagName ?? "").toLowerCase();
        if (childTag === "outline") {
          processOutline(child, id);
        } else {
          skippedCount++;
        }
      }

      return id;
    }

    const rootId = processOutline(rootEl);

    const positions = computeTreeLayout(
      rootId,
      0,
      currentRootY,
      "right",
      childrenByParent,
      sizes
    );

    let maxY = currentRootY;
    for (const block of treeBlocks) {
      const pos = positions.get(block.id);
      if (pos) {
        block.transform = createComputedTransform({
          ...NEW_NODE_SIZE,
          x: pos.x,
          y: pos.y,
          rotation: 0,
          zIndex: 0,
        });
        maxY = Math.max(maxY, pos.y + NEW_NODE_SIZE.h);
      }
    }

    allBlocks.push(...treeBlocks);
    currentRootY = maxY + 60;
  }

  return {
    blocks: allBlocks,
    connectors: allConnectors,
    skippedCount,
  };
}
