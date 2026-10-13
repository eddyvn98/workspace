import type { BlockId, CanvasBlock } from "../types/block";
import { createBlockId } from "../types/block";
import type { CanvasConnector } from "../types/connector";
import { createConnectorId } from "../types/connector";
import { convertMindmapTreesToBlocks } from "./markdownMindmapBlocks";
import { convertOutlineItemsToBlocks } from "./markdownOutlineBlocks";
import { buildImportedTableBlocks, extractPipeTables } from "./markdownImportTables";

const DATA_BLOCK_START = "<!--WORKSPACE_DATA";
const DATA_BLOCK_END = "WORKSPACE_DATA-->";
const MINDMAP_DATA_BLOCK_START = "<!--MINDMAP_DATA";
const MINDMAP_DATA_BLOCK_END = "MINDMAP_DATA-->";

export interface MarkdownImportResult {
  blocks: CanvasBlock[];
  connectors: CanvasConnector[];
  skippedCount: number;
}

function extractWorkspaceData(text: string): {
  blocks: CanvasBlock[];
  connectors: CanvasConnector[];
} | null {
  const start = text.indexOf(DATA_BLOCK_START);
  if (start === -1) return null;
  const end = text.indexOf(DATA_BLOCK_END, start);
  if (end === -1) return null;

  const jsonStr = text.slice(start + DATA_BLOCK_START.length, end).trim();
  try {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== "object" || !data.blocks) return null;

    const rawBlocks: Record<string, CanvasBlock> = data.blocks;
    const rawConnectors: Record<string, CanvasConnector> = data.connectors || {};

    const idMap = new Map<string, string>();
    for (const oldId of Object.keys(rawBlocks)) {
      idMap.set(oldId, createBlockId());
    }

    const newBlocks: CanvasBlock[] = [];
    for (const [oldId, oldBlock] of Object.entries(rawBlocks)) {
      const newId = idMap.get(oldId)!;
      const newParentId = oldBlock.parentId ? idMap.get(oldBlock.parentId) : undefined;
      const newBlock: CanvasBlock = {
        ...oldBlock,
        id: newId,
        parentId: newParentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      newBlocks.push(newBlock);
    }

    const newConnectors: CanvasConnector[] = [];
    for (const oldConnector of Object.values(rawConnectors)) {
      const newFrom = idMap.get(oldConnector.fromBlockId);
      const newTo = idMap.get(oldConnector.toBlockId);
      if (newFrom && newTo) {
        newConnectors.push({
          ...oldConnector,
          id: createConnectorId(),
          fromBlockId: newFrom,
          toBlockId: newTo,
        });
      }
    }

    return { blocks: newBlocks, connectors: newConnectors };
  } catch {
    return null;
  }
}

export interface OldMindmapNode {
  id?: string;
  topic?: string;
  name?: string;
  children?: OldMindmapNode[];
  icon?: string;
  description?: string;
  style?: {
    backgroundColor?: string;
    borderColor?: string;
    color?: string;
  };
}

function extractMindmapData(text: string): MarkdownImportResult | null {
  const start = text.indexOf(MINDMAP_DATA_BLOCK_START);
  if (start === -1) return null;
  const end = text.indexOf(MINDMAP_DATA_BLOCK_END, start);
  if (end === -1) return null;

  const jsonStr = text.slice(start + MINDMAP_DATA_BLOCK_START.length, end).trim();
  try {
    const data = JSON.parse(jsonStr);
    const nodes: OldMindmapNode[] = Array.isArray(data)
      ? data
      : data && typeof data === "object"
      ? [data]
      : [];
    if (nodes.length === 0) return null;

    return convertMindmapTreesToBlocks(nodes);
  } catch {
    return null;
  }
}

export interface ParsedOutlineItem {
  id: BlockId;
  text: string;
  type: "heading" | "list";
  level: number;
  children: ParsedOutlineItem[];
}

function parseMarkdownOutlines(text: string): ParsedOutlineItem[] {
  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, "").trim();
  const lines = withoutComments.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const roots: ParsedOutlineItem[] = [];
  const stack: ParsedOutlineItem[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(\s*)(#{1,6})\s+(.*)$/);
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);

    let type: "heading" | "list";
    let level: number;
    let textContent: string;

    if (headingMatch) {
      type = "heading";
      level = headingMatch[2].length;
      textContent = headingMatch[3].trim();
    } else if (listMatch) {
      type = "list";
      const indentStr = listMatch[1].replace(/\t/g, "  ");
      level = indentStr.length;
      textContent = listMatch[3].trim();
    } else {
      type = "list";
      const indentStr = (line.match(/^(\s*)/)?.[1] ?? "").replace(/\t/g, "  ");
      level = indentStr.length;
      textContent = line.trim();
    }

    if (!textContent) continue;

    const item: ParsedOutlineItem = {
      id: createBlockId(),
      text: textContent,
      type,
      level,
      children: [],
    };

    if (type === "heading") {
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type === "heading" && top.level < level) break;
        stack.pop();
      }
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(item);
      } else {
        roots.push(item);
      }
      stack.push(item);
    } else {
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type === "heading") break;
        if (top.type === "list" && top.level < level) break;
        stack.pop();
      }
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(item);
      } else {
        roots.push(item);
      }
      stack.push(item);
    }
  }

  return roots;
}

export function importFromMarkdown(text: string): MarkdownImportResult {
  const wsData = extractWorkspaceData(text);
  if (wsData && wsData.blocks.length > 0) {
    return { ...wsData, skippedCount: 0 };
  }

  const mmData = extractMindmapData(text);
  if (mmData && mmData.blocks.length > 0) {
    return mmData;
  }

  const { text: withoutTables, tables } = extractPipeTables(text);
  const outlineRoots = parseMarkdownOutlines(withoutTables);
  if (outlineRoots.length === 0) {
    const tableBlocks = buildImportedTableBlocks(tables, []);
    return { blocks: tableBlocks, connectors: [], skippedCount: 0 };
  }

  const outline = convertOutlineItemsToBlocks(outlineRoots);
  return tables.length ? { ...outline, blocks: [...outline.blocks, ...buildImportedTableBlocks(tables, outline.blocks)] } : outline;
}
