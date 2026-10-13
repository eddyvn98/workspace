import type { BlockId, CanvasBlock } from "../types/block";
import type { CanvasConnector, ConnectorId } from "../types/connector";
import { renderSlideDeckMarkdown, slideDeckLabel } from "./markdownSlideExport";
import { renderMarkdownPipeTable } from "./tableImportParsers";

const DATA_BLOCK_START = "<!--WORKSPACE_DATA";
const DATA_BLOCK_END = "WORKSPACE_DATA-->";

function getBlockLabel(block: CanvasBlock): string {
  let text = "";
  if (block.type === "text") {
    text = (block.data as { markdown?: string })?.markdown ?? "";
  } else if (block.type === "link") {
    const d = block.data as { title?: string; url?: string };
    text = d?.title ? `[${d.title}](${d.url || "#"})` : d?.url || "Untitled Link";
  } else if (block.type === "image") {
    const d = block.data as { alt?: string; url?: string };
    text = d?.url ? `![${d.alt || "image"}](${d.url})` : "";
  } else if (block.type === "table") {
    const d = block.data as { cells?: string[][] };
    // A real pipe table; the node line is "Table" and the grid follows as continuation lines.
    text = d?.cells && d.cells.length > 0 ? `Table\n${renderMarkdownPipeTable(d.cells)}` : "Table";
  } else if (block.type === "shape") {
    const kind = (block.data as { shapeKind?: string })?.shapeKind || "shape";
    text = `[${kind}]`;
  } else if (block.type === "path") {
    text = "[Drawing]";
  } else if (block.type === "slideDeck") {
    text = slideDeckLabel(block.data);
  }

  if (block.icon) {
    text = `${block.icon} ${text}`.trim();
  }
  return text;
}

function renderMarkdownNode(
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

  const label = getBlockLabel(block);
  const indent = "  ".repeat(depth);
  const children = (childrenByParent.get(blockId) ?? []).filter((id) => !visited.has(id));

  const lines = label.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let nodeStr = "";
  if (lines.length === 0) {
    nodeStr = `${indent}- (empty)\n`;
  } else {
    nodeStr = `${indent}- ${lines[0]}\n`;
    for (let i = 1; i < lines.length; i++) {
      nodeStr += `${indent}  ${lines[i]}\n`;
    }
  }

  if (block.description) {
    nodeStr += `${indent}  > ${block.description}\n`;
  }

  if (block.type === "slideDeck") {
    const slides = renderSlideDeckMarkdown(block.data);
    if (slides) nodeStr += `\n${slides}\n\n`;
  }

  for (const childId of children) {
    nodeStr += renderMarkdownNode(childId, depth + 1, visited, blocks, childrenByParent);
  }

  return nodeStr;
}

export function exportToMarkdown(
  blocks: Record<BlockId, CanvasBlock>,
  blockOrder: BlockId[],
  title?: string,
  connectors?: Record<ConnectorId, CanvasConnector>
): string {
  const allBlocks = blockOrder
    .map((id) => blocks[id])
    .filter((b): b is CanvasBlock => Boolean(b));

  const blockMap = new Map<BlockId, CanvasBlock>();
  allBlocks.forEach((b) => blockMap.set(b.id, b));

  const childrenByParent = new Map<BlockId, BlockId[]>();
  for (const block of allBlocks) {
    if (block.parentId && blockMap.has(block.parentId)) {
      const list = childrenByParent.get(block.parentId) ?? [];
      list.push(block.id);
      childrenByParent.set(block.parentId, list);
    }
  }

  const visited = new Set<BlockId>();
  let outline = "";

  const roots = allBlocks.filter((b) => !b.parentId || !blockMap.has(b.parentId));
  for (const root of roots) {
    outline += renderMarkdownNode(root.id, 0, visited, blocks, childrenByParent);
  }

  const titleHeader = title ? `# ${title}\n\n` : "";
  const payload = {
    version: 1,
    title: title || "workspace",
    blocks,
    blockOrder,
    connectors: connectors ?? {},
    exportedAt: Date.now(),
  };
  const dataBlock = `${DATA_BLOCK_START}\n${JSON.stringify(payload)}\n${DATA_BLOCK_END}\n`;

  return `${titleHeader}${outline}\n${dataBlock}`;
}

export function exportSelectionToMarkdown(
  blocks: Record<BlockId, CanvasBlock>,
  selectedBlockIds: BlockId[],
  blockOrder: BlockId[],
  title?: string,
  connectors?: Record<ConnectorId, CanvasConnector>
): string {
  const selectedSet = new Set(selectedBlockIds);
  const selectedBlocks = blockOrder
    .filter((id) => selectedSet.has(id))
    .map((id) => blocks[id])
    .filter((b): b is CanvasBlock => Boolean(b));

  const selectedBlocksRecord: Record<BlockId, CanvasBlock> = {};
  selectedBlocks.forEach((b) => {
    selectedBlocksRecord[b.id] = b;
  });

  const childrenByParent = new Map<BlockId, BlockId[]>();
  for (const block of selectedBlocks) {
    if (block.parentId && selectedSet.has(block.parentId)) {
      const list = childrenByParent.get(block.parentId) ?? [];
      list.push(block.id);
      childrenByParent.set(block.parentId, list);
    }
  }

  const selectedConnectors: Record<ConnectorId, CanvasConnector> = {};
  if (connectors) {
    for (const [id, c] of Object.entries(connectors)) {
      if (selectedSet.has(c.fromBlockId) && selectedSet.has(c.toBlockId)) {
        selectedConnectors[id] = c;
      }
    }
  }

  const visited = new Set<BlockId>();
  let outline = "";

  const roots = selectedBlocks.filter((b) => !b.parentId || !selectedSet.has(b.parentId));
  for (const root of roots) {
    outline += renderMarkdownNode(root.id, 0, visited, blocks, childrenByParent);
  }

  const docTitle = `${title || "workspace"} (Selection)`;
  const titleHeader = `# ${docTitle}\n\n`;
  const payload = {
    version: 1,
    title: docTitle,
    blocks: selectedBlocksRecord,
    blockOrder: selectedBlocks.map((b) => b.id),
    connectors: selectedConnectors,
    exportedAt: Date.now(),
  };
  const dataBlock = `${DATA_BLOCK_START}\n${JSON.stringify(payload)}\n${DATA_BLOCK_END}\n`;

  return `${titleHeader}${outline}\n${dataBlock}`;
}
