import { boardMetadata } from "./boardMetadata";
import type { WorkspaceBoard } from "@prisma/client";
import { asBlockRecord } from "@/app/api/workspaces/_edit-events";
import { exportSelectionToMarkdown, exportToMarkdown } from "@/app/workspace/utils/markdownExport";
import { importFromMarkdown } from "@/app/workspace/utils/markdownImport";
import { exportToOpml } from "@/app/workspace/utils/opml";
import { createBlockId } from "@/app/workspace/types/block";
import { createConnectorId } from "@/app/workspace/types/connector";
import { commitContentAndNotify, type BoardAccessRole, type BoardFailure } from "./board-commit-notify";
import { includeWorkspaceDocTables, remapWorkspaceDocReferences } from '@/app/workspace/utils/workspaceDocReferences';
import { remapContainerReferences } from '@/app/workspace/utils/blockReferences';

const MAX_EXPORT_CHARS = 200_000;
const MAX_IMPORT_CHARS = 200_000;
const MAX_IMPORT_BLOCKS = 500;
const PLACEMENT_GAP = 48;

type Rec = Record<string, any>;
export const EXPORT_FORMATS = ["markdown", "json", "opml"] as const;

export function exportBoardContent(board: WorkspaceBoard, format: unknown, blockIds: unknown):
  { ok: true; export: { format: string; content: string; blockCount: number } } | BoardFailure {
  if (!EXPORT_FORMATS.includes(format as never)) {
    return { ok: false, status: 400, error: "format must be markdown, json or opml", reason: "invalid_format" };
  }
  const allBlocks = asBlockRecord(board.blocks) as Rec;
  const allConnectors = asBlockRecord(board.connectors) as Rec;
  const fullOrder = (Array.isArray(board.blockOrder) ? board.blockOrder.map(String) : []).filter((id) => allBlocks[id]);
  let ids: string[] | null = null;
  if (blockIds !== undefined && blockIds !== null) {
    if (!Array.isArray(blockIds) || blockIds.some((id) => typeof id !== "string")) {
      return { ok: false, status: 400, error: "blockIds must be an array of block ids", reason: "invalid_block_ids" };
    }
    const missing = (blockIds as string[]).filter((id) => !allBlocks[id]);
    if (missing.length > 0) return { ok: false, status: 422, error: `Unknown block ids: ${missing.slice(0, 5).join(", ")}`, reason: "block_not_found" };
    ids = blockIds as string[];
  }
  const selected = new Set(includeWorkspaceDocTables(allBlocks, ids ?? [...fullOrder, ...Object.keys(allBlocks)]));
  const blocks: Rec = {};
  for (const id of selected) blocks[id] = allBlocks[id]?.embeddedInDocId && !selected.has(allBlocks[id].embeddedInDocId)
    ? { ...allBlocks[id], embeddedInDocId: undefined } : allBlocks[id];
  const order = [...new Set([...fullOrder.filter((id) => selected.has(id)), ...selected])];
  const connectors: Rec = {};
  for (const [id, c] of Object.entries(allConnectors)) {
    if (selected.has(c?.fromBlockId) && selected.has(c?.toBlockId)) connectors[id] = c;
  }
  let content: string;
  if (format === "markdown") {
    content = ids ? exportSelectionToMarkdown(allBlocks, order, fullOrder, board.title, allConnectors) : exportToMarkdown(allBlocks, fullOrder, board.title, allConnectors);
  } else if (format === "opml") {
    content = exportToOpml(blocks, board.title);
  } else {
    content = JSON.stringify({ version: 1, title: board.title, blocks, blockOrder: order, connectors, camera: board.camera, ...boardMetadata(board), exportedAt: Date.now() });
  }
  if (content.length > MAX_EXPORT_CHARS) {
    return { ok: false, status: 413, error: "Export is too large to return; select fewer blocks with blockIds", reason: "export_too_large" };
  }
  return { ok: true, export: { format: String(format), content, blockCount: order.length } };
}

function frameOf(block: Rec): Rec | null {
  return block?.transform?.override ?? block?.transform?.computed ?? null;
}

function bottomOf(blocks: Rec): number | null {
  let bottom: number | null = null;
  for (const block of Object.values(blocks)) {
    const t = frameOf(block);
    if (t && Number.isFinite(t.y)) bottom = Math.max(bottom ?? -Infinity, t.y + (Number.isFinite(t.h) ? t.h : 0));
  }
  return bottom;
}

export async function importMarkdownIntoBoard(
  board: WorkspaceBoard, email: string, role: BoardAccessRole, input: { markdown: unknown; baseRevision: unknown },
): Promise<{ ok: true; board: WorkspaceBoard; ids: string[] } | BoardFailure> {
  if (role === "VIEWER") return { ok: false, status: 403, error: "Viewer role cannot import content", reason: "forbidden" };
  if (typeof input.markdown !== "string" || !input.markdown.trim()) {
    return { ok: false, status: 400, error: "markdown (non-empty string) required", reason: "markdown_required" };
  }
  if (input.markdown.length > MAX_IMPORT_CHARS) return { ok: false, status: 413, error: "Markdown is too large", reason: "import_too_large" };
  if (typeof input.baseRevision !== "number" || !Number.isInteger(input.baseRevision)) {
    return { ok: false, status: 400, error: "baseRevision (integer) required", reason: "base_revision_required" };
  }
  if (input.baseRevision !== board.revision) {
    return { ok: false, status: 409, error: "Board changed since baseRevision; re-read the board", reason: "stale", revision: board.revision };
  }
  const parsed = importFromMarkdown(input.markdown);
  if (parsed.blocks.length === 0) return { ok: false, status: 422, error: "No importable content found", reason: "nothing_to_import" };
  if (parsed.blocks.length > MAX_IMPORT_BLOCKS) return { ok: false, status: 413, error: `Import is limited to ${MAX_IMPORT_BLOCKS} blocks`, reason: "import_too_large" };

  const existingBlocks = asBlockRecord(board.blocks) as Rec;
  const existingConnectors = asBlockRecord(board.connectors) as Rec;
  const idMap = new Map<string, string>();
  const mapIdMap = new Map<string, string>();
  for (const block of parsed.blocks as Rec[]) {
    let next = createBlockId();
    while (existingBlocks[next]) next = createBlockId();
    idMap.set(block.id, next);
    if (block.mapId && !mapIdMap.has(block.mapId)) mapIdMap.set(block.mapId, createBlockId());
  }
  const minY = Math.min(...(parsed.blocks as Rec[]).map((b) => frameOf(b)?.y).filter((y): y is number => Number.isFinite(y)), Infinity);
  const bottom = bottomOf(existingBlocks);
  const dy = (bottom === null ? 0 : bottom + PLACEMENT_GAP) - (Number.isFinite(minY) ? minY : 0);
  const shift = (t: Rec | null) => (t ? { ...t, y: t.y + dy } : t);
  const added: Rec = {};
  for (const block of parsed.blocks as Rec[]) {
    const id = idMap.get(block.id)!;
    added[id] = remapWorkspaceDocReferences({
      ...block,
      id,
      data: remapContainerReferences(block.data, idMap),
      parentId: block.parentId ? idMap.get(block.parentId) : undefined,
      mapId: block.mapId ? mapIdMap.get(block.mapId) : undefined,
      transform: { computed: shift(block.transform?.computed ?? null), override: shift(block.transform?.override ?? null) },
    }, idMap);
  }
  const addedConnectors: Rec = {};
  for (const connector of parsed.connectors as Rec[]) {
    const from = idMap.get(connector.fromBlockId);
    const to = idMap.get(connector.toBlockId);
    if (!from || !to) continue;
    const id = createConnectorId();
    addedConnectors[id] = { ...connector, id, fromBlockId: from, toBlockId: to };
  }
  const ids = Object.keys(added);
  const order = Array.isArray(board.blockOrder) ? board.blockOrder.map(String) : [];
  const result = await commitContentAndNotify(board, email, {
    blocks: { ...existingBlocks, ...added },
    blockOrder: [...order, ...ids],
    connectors: { ...existingConnectors, ...addedConnectors },
  });
  return result.ok ? { ok: true, board: result.board, ids } : result;
}
