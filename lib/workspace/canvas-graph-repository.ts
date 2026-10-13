/**
 * lib/workspace/canvas-graph-repository.ts
 *
 * Wires the pure graph walk in ./canvas-graph.ts to the database: fetches the
 * one board's blocks/connectors, turns hybrid-search hits into seeds, and
 * returns both the ranked chunks and the structural context around them.
 * Workspace twin of lib/mindmap/canvas-graph-repository.ts, minus the
 * multi-map "workspace scope" — see ./canvas-graph.ts for why that dimension
 * does not exist here.
 */

import { prisma } from "@/lib/prisma";
import { requireBoardRead } from "./knowledge-repository";
import {
  hybridSearchKnowledge,
  withDocumentFilenames,
  type HybridSearchResult,
  type KnowledgeSearchResult,
} from "./knowledge-search";
import { blockDataText } from "./knowledge-block-text";
import { buildCanvasGraphContext, type GraphBlockRow, type GraphConnectorRow, type GraphSeed } from "./canvas-graph";
import type { CanvasBlock } from "@/app/workspace/types/block";
import type { CanvasConnector } from "@/app/workspace/types/connector";

export type CanvasGraphSearchOptions = {
  limit?: number;
  maxHops?: number;
  maxNodes?: number;
  selectedBlockIds?: readonly string[];
};

export type CanvasGraphSearchResponse = {
  results: Array<HybridSearchResult & { filename: string | null }>;
  graph: ReturnType<typeof buildCanvasGraphContext>;
};

function asBlockRows(raw: unknown): GraphBlockRow[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).flatMap(([id, value]) => {
    if (!value || typeof value !== "object") return [];
    const block = value as CanvasBlock;
    return [{
      id,
      parentId: block.parentId ?? null,
      topic: blockDataText(block),
      description: block.description ?? null,
    }];
  });
}

function asConnectorRows(raw: unknown): GraphConnectorRow[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).flatMap(([id, value]) => {
    if (!value || typeof value !== "object") return [];
    const connector = value as CanvasConnector;
    if (!connector.fromBlockId || !connector.toBlockId) return [];
    return [{
      id,
      fromBlockId: connector.fromBlockId,
      toBlockId: connector.toBlockId,
      ...(connector.label ? { label: connector.label } : {}),
    }];
  });
}

/**
 * The structural walk around whatever chunks already matched. Takes the
 * caller's own search hits rather than running a search itself, so a caller
 * that already chose a mode (fulltext vs. hybrid) does not pay for a second,
 * discarded hybrid search just to get a graph.
 */
export async function buildGraphForHits(
  boardId: string,
  // Accepts either search mode's rows: a fulltext-only hit carries `rank`,
  // not `fusedScore` — both are just "how well this matched", so either one
  // becomes the seed's score below.
  hits: Array<KnowledgeSearchResult | HybridSearchResult>,
  options: CanvasGraphSearchOptions = {},
): Promise<ReturnType<typeof buildCanvasGraphContext>> {
  const board = await prisma.workspaceBoard.findUnique({
    where: { id: boardId },
    select: { blocks: true, connectors: true },
  });
  const blocks = asBlockRows(board?.blocks);
  const connectors = asConnectorRows(board?.connectors);
  const blockById = new Map(blocks.map((block) => [block.id, block]));

  const seedByBlock = new Map<string, GraphSeed>();
  for (const blockId of options.selectedBlockIds ?? []) {
    const block = blockById.get(blockId);
    if (!block) continue;
    seedByBlock.set(blockId, { blockId, score: 1_000_000, content: block.topic });
  }
  for (const hit of hits) {
    if (!hit.blockId || seedByBlock.has(hit.blockId)) continue;
    const score = "fusedScore" in hit ? hit.fusedScore : hit.rank;
    seedByBlock.set(hit.blockId, { blockId: hit.blockId, score, content: hit.content });
  }
  // No seed at all (a query that only matched a document, or matched
  // nothing) still gets a graph: the board's own top-level blocks, so the
  // context is never silently empty just because nothing on the canvas
  // itself matched the words.
  if (seedByBlock.size === 0) {
    for (const block of blocks.filter((candidate) => !candidate.parentId).slice(0, 12)) {
      seedByBlock.set(block.id, { blockId: block.id, score: 0, content: block.topic, reason: "overview" });
    }
  }

  return buildCanvasGraphContext({
    blocks,
    connectors,
    seeds: [...seedByBlock.values()],
    maxHops: options.maxHops,
    maxNodes: options.maxNodes,
  });
}

/**
 * Convenience entry point that runs its own hybrid search first: ranked
 * chunks plus the board's own structure around the blocks that matched. A
 * chunk hit only ever says WHAT was found, never what it connects to, so the
 * walk is what lets an answer cite "the risk block, linked to the Q3 budget
 * block" instead of just the risk block on its own.
 */
export async function searchCanvasGraph(
  boardId: string,
  callerEmail: string,
  query: string,
  options: CanvasGraphSearchOptions = {},
): Promise<CanvasGraphSearchResponse> {
  // Throws WorkspaceAccessError (404 stranger / never a 403 for a read) —
  // same check every other board-scoped read in this feature makes, reused
  // rather than re-derived so the anti-enumeration rule cannot drift here.
  await requireBoardRead(boardId, callerEmail);

  const limit = Math.min(12, Math.max(1, options.limit ?? 8));
  const hits = await hybridSearchKnowledge(boardId, query, limit);
  const [results, graph] = await Promise.all([
    withDocumentFilenames(hits),
    buildGraphForHits(boardId, hits, options),
  ]);

  return { results, graph };
}
