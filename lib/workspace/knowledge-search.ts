/**
 * lib/workspace/knowledge-search.ts
 *
 * Hybrid search over a board's knowledge chunks: Postgres full-text plus
 * vector similarity, fused by reciprocal rank. Workspace twin of the search
 * half of lib/mindmap/knowledge-repository.ts, split from
 * ./knowledge-repository.ts at the 300-line cap.
 *
 * Two legs, deliberately, because each is bad at what the other is good at.
 * Full-text finds an exact term a vector model will happily paraphrase away —
 * a part number, a person's name, an acronym. The vector leg finds the passage
 * that answers the question in different words. Running only one of them
 * fails quietly: the results still look plausible, they are just missing the
 * hit you needed.
 */

import { prisma } from "@/lib/prisma";
import { cosineSimilarity, embed } from "@/lib/embeddings";

/** Per-leg candidate depth. Wider than the caller's limit on purpose: fusion
 *  can only rank what each leg actually returned, so cutting the legs to the
 *  final size would throw away the very rows the other leg was going to
 *  promote. */
const LEG_LIMIT = 15;

/** The standard RRF constant from the original TREC paper. It controls how
 *  fast rank position decays and is not a tuning knob for this data — a
 *  different value here would only mean "we disagree with the paper". */
const RRF_K = 60;

export interface KnowledgeSearchResult {
  id: string;
  sourceType: "DOCUMENT" | "BLOCK";
  sourceDocumentId: string | null;
  blockId: string | null;
  content: string;
  rank: number;
}

export interface HybridSearchResult extends KnowledgeSearchResult {
  fusedScore: number;
}

/** Two at a time, same cap knowledge-block-chunks.ts uses for the same
 *  in-process WASM embedder — running a whole large document's chunks at
 *  once starves the request handlers this process also serves. */
const EMBEDDING_CONCURRENCY = 2;

/** Embeds a batch, never failing the caller. An empty array means "not
 *  embedded yet", which the full-text leg copes with — see the comment on
 *  WorkspaceKnowledgeChunk.embedding. */
export async function embedAll(texts: string[]): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);
  for (let offset = 0; offset < texts.length; offset += EMBEDDING_CONCURRENCY) {
    const batch = texts.slice(offset, offset + EMBEDDING_CONCURRENCY);
    const embedded = await Promise.all(batch.map((text) => embed(text).catch(() => [] as number[])));
    embedded.forEach((vector, i) => { results[offset + i] = vector; });
  }
  return results;
}

/** Keyword leg. `searchVector` is a generated column added by hand in the
 *  migration and absent from the Prisma model, so this has to be raw SQL.
 *  'simple' rather than 'english': content here may be Vietnamese or mixed,
 *  and English stemming would mis-rank those matches with nothing to notice. */
function fullTextLeg(boardId: string, query: string) {
  return prisma.$queryRaw<KnowledgeSearchResult[]>`
    SELECT "id", "sourceType", "sourceDocumentId", "blockId", "content",
           ts_rank("searchVector", plainto_tsquery('simple', ${query})) AS "rank"
    FROM "workspace_knowledge_chunks"
    WHERE "boardId" = ${boardId}
      AND "searchVector" @@ plainto_tsquery('simple', ${query})
    ORDER BY "rank" DESC
    LIMIT ${LEG_LIMIT}
  `;
}

/** Vector leg: brute-force cosine similarity in JS over this board's embedded
 *  chunks. Fine at this scale — a board's chunk count is bounded by its own
 *  canvas and uploads, not by the database — and it is why the column is a
 *  plain Float[] rather than pgvector. */
async function vectorLeg(boardId: string, query: string): Promise<KnowledgeSearchResult[]> {
  const queryVector = await embed(query).catch(() => null);
  // No vector means no vector leg, not no search: the caller still gets the
  // full-text results rather than an error.
  if (!queryVector) return [];

  const rows = await prisma.workspaceKnowledgeChunk.findMany({
    where: { boardId, embedding: { isEmpty: false } },
    select: {
      id: true,
      sourceType: true,
      sourceDocumentId: true,
      blockId: true,
      content: true,
      embedding: true,
    },
  });

  return rows
    .map((row) => ({ ...row, rank: cosineSimilarity(queryVector, row.embedding) }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, LEG_LIMIT)
    .map((row) => {
      const publicRow = { ...row };
      Reflect.deleteProperty(publicRow, "embedding");
      return publicRow;
    });
}

/** Reciprocal Rank Fusion. Combines two independently-ranked lists without
 *  needing their scores to be on comparable scales — which matters here
 *  because ts_rank and cosine similarity are not remotely comparable, and
 *  simply adding them would let whichever happens to have the larger
 *  magnitude decide every ranking on its own. */
export function fuse(legs: KnowledgeSearchResult[][], limit: number): HybridSearchResult[] {
  const fused = new Map<string, HybridSearchResult>();
  for (const leg of legs) {
    leg.forEach((row, rank) => {
      const contribution = 1 / (RRF_K + rank + 1);
      const existing = fused.get(row.id);
      if (existing) existing.fusedScore += contribution;
      else fused.set(row.id, { ...row, fusedScore: contribution });
    });
  }
  return [...fused.values()].sort((a, b) => b.fusedScore - a.fusedScore).slice(0, limit);
}

/**
 * Names the file a DOCUMENT hit came from.
 *
 * A chunk stores only `sourceDocumentId`, and an id is the one thing a reader
 * cannot check an answer against — the filename is. Resolved here rather than
 * joined in each leg because the full-text leg is raw SQL over a generated
 * column and a join there would have to be written twice, once per leg, to
 * survive fusion.
 *
 * One query for the whole page of results, not one per hit.
 */
export async function withDocumentFilenames<T extends KnowledgeSearchResult>(
  results: T[],
): Promise<(T & { filename: string | null })[]> {
  const ids = [...new Set(results.map((row) => row.sourceDocumentId).filter((id): id is string => !!id))];
  if (ids.length === 0) return results.map((row) => ({ ...row, filename: null }));
  const documents = await prisma.workspaceSourceDocument.findMany({
    where: { id: { in: ids } },
    select: { id: true, filename: true },
  });
  const nameById = new Map(documents.map((document) => [document.id, document.filename]));
  return results.map((row) => ({
    ...row,
    filename: row.sourceDocumentId ? nameById.get(row.sourceDocumentId) ?? null : null,
  }));
}

/** Full-text only. Kept separate from the hybrid entry point so a caller that
 *  wants keyword behaviour gets it without paying for an embed. */
export async function searchKnowledge(
  boardId: string,
  query: string,
  limit = 8,
): Promise<KnowledgeSearchResult[]> {
  if (!query.trim()) return [];
  const exact = (await fullTextLeg(boardId, query)).slice(0, limit);
  if (exact.length > 0) return exact;
  return keywordFallback(boardId, query, limit);
}

/**
 * Dify's tool often receives the whole natural-language request instead of a
 * short search phrase. `plainto_tsquery` quite correctly returns no row when
 * none of all those terms occur together, but that is a poor retrieval
 * result. Fall back to bounded token scoring so a long request still finds a
 * document containing its distinctive words. This is deliberately after the
 * indexed leg, not a replacement for it.
 */
async function keywordFallback(
  boardId: string,
  query: string,
  limit: number,
): Promise<KnowledgeSearchResult[]> {
  const tokens = [...new Set(
    query.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 3),
  )];
  if (tokens.length === 0) return [];
  const rows = await prisma.workspaceKnowledgeChunk.findMany({
    where: { boardId },
    select: { id: true, sourceType: true, sourceDocumentId: true, blockId: true, content: true },
  });
  const documentIds = [...new Set(rows.map((row) => row.sourceDocumentId).filter((id): id is string => Boolean(id)))];
  const documents = documentIds.length
    ? await prisma.workspaceSourceDocument.findMany({
        where: { id: { in: documentIds } },
        select: { id: true, filename: true },
      })
    : [];
  const filenameById = new Map(documents.map((document) => [document.id, document.filename]));
  return rows
    .map((row) => {
      const normalized = row.content.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
      const filename = row.sourceDocumentId
        ? filenameById.get(row.sourceDocumentId)?.toLowerCase() ?? ""
        : "";
      const score = tokens.reduce((total, token) => total +
        (filename.includes(token) ? 5 : 0) +
        (normalized.includes(token) ? 1 : 0), 0);
      return { ...row, rank: score };
    })
    .filter((row) => row.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);
}

export async function hybridSearchKnowledge(
  boardId: string,
  query: string,
  limit = 8,
): Promise<HybridSearchResult[]> {
  if (!query.trim()) return [];
  // Both legs at once: the vector leg has to embed the query, and running it
  // after the SQL would add that latency to every search for nothing.
  const legs = await Promise.all([fullTextLeg(boardId, query), vectorLeg(boardId, query)]);
  const fused = fuse(legs, limit);
  if (fused.length > 0) return fused;
  return (await keywordFallback(boardId, query, limit)).map((row) => ({
    ...row,
    fusedScore: 0,
  }));
}
