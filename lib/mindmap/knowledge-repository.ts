/**
 * lib/mindmap/knowledge-repository.ts
 *
 * Per-mindmap document knowledge base: MindmapSourceDocument (one row per
 * uploaded file) + MindmapKnowledgeChunk (searchable slices, either from a
 * document or re-synced from a node's own topic/description text).
 *
 * See "Document Knowledge Base & Retrieval" in
 * .claude/specs/active/mindmap-integrations.md for the design rationale.
 * Access control mirrors lib/mindmap/repository.ts: getAccess() + the same
 * MindmapAccessError shape, reused here rather than re-derived.
 */

import { prisma } from "@/lib/prisma";
import { getAccess, MindmapAccessError, type MindmapNodeLike } from "@/lib/mindmap/repository";
import { embed, cosineSimilarity } from "@/lib/embeddings";

const MAX_CHUNK_LENGTH = 2000;

async function requireRead(mindmapId: string, callerEmail: string): Promise<void> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.role) throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
}

async function requireWrite(mindmapId: string, callerEmail: string): Promise<void> {
  const access = await getAccess(mindmapId, callerEmail);
  if (!access.role) throw new MindmapAccessError("NOT_FOUND", "Mindmap not found");
  if (!access.canWrite) throw new MindmapAccessError("FORBIDDEN", "Viewer role cannot write to this mindmap");
}

/** Splits on blank-line paragraph boundaries first (keeps a paragraph
 *  intact as one chunk when it fits), hard-slicing any paragraph that's
 *  still too long on its own. Simple on purpose — chunk boundaries only
 *  need to keep ts_rank matches roughly coherent, not perfectly semantic. */
export function chunkText(text: string, maxLen = MAX_CHUNK_LENGTH): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];

  let buffer = "";
  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLen) {
      buffer = candidate;
      continue;
    }
    if (buffer) chunks.push(buffer);
    if (paragraph.length <= maxLen) {
      buffer = paragraph;
    } else {
      for (let i = 0; i < paragraph.length; i += maxLen) {
        chunks.push(paragraph.slice(i, i + maxLen));
      }
      buffer = "";
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

export interface SourceDocumentSummary {
  id: string;
  filename: string;
  mimeType: string;
  uploadedByEmail: string;
  createdAt: Date;
}

export async function addSourceDocument(
  mindmapId: string,
  callerEmail: string,
  doc: { filename: string; mimeType: string; extractedText: string },
): Promise<SourceDocumentSummary> {
  await requireWrite(mindmapId, callerEmail);

  const created = await prisma.mindmapSourceDocument.create({
    data: {
      mindmapId,
      filename: doc.filename,
      mimeType: doc.mimeType,
      extractedText: doc.extractedText,
      uploadedByEmail: callerEmail,
    },
    select: { id: true, filename: true, mimeType: true, uploadedByEmail: true, createdAt: true },
  });

  const chunks = chunkText(doc.extractedText);
  if (chunks.length) {
    // Embedding is best-effort: a failed/slow embed must not block indexing
    // the chunk for full-text search, which still works without it.
    const embeddings = await Promise.all(chunks.map((content) => embed(content).catch(() => [])));
    await prisma.mindmapKnowledgeChunk.createMany({
      data: chunks.map((content, i) => ({
        mindmapId,
        sourceType: "DOCUMENT" as const,
        sourceDocumentId: created.id,
        content,
        embedding: embeddings[i],
      })),
    });
  }

  return created;
}

export async function listSourceDocuments(
  mindmapId: string,
  callerEmail: string,
): Promise<SourceDocumentSummary[]> {
  await requireRead(mindmapId, callerEmail);
  return prisma.mindmapSourceDocument.findMany({
    where: { mindmapId },
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true, mimeType: true, uploadedByEmail: true, createdAt: true },
  });
}

export async function deleteSourceDocument(
  mindmapId: string,
  callerEmail: string,
  documentId: string,
): Promise<void> {
  await requireWrite(mindmapId, callerEmail);
  const doc = await prisma.mindmapSourceDocument.findFirst({ where: { id: documentId, mindmapId } });
  if (!doc) throw new MindmapAccessError("NOT_FOUND", "Document not found");
  // Chunks cascade via the sourceDocumentId FK (onDelete: Cascade).
  await prisma.mindmapSourceDocument.delete({ where: { id: documentId } });
}

export interface KnowledgeSearchResult {
  id: string;
  sourceType: "DOCUMENT" | "NODE";
  sourceDocumentId: string | null;
  nodeId: string | null;
  content: string;
  rank: number;
}

/** Keyword search via Postgres tsvector/ts_rank. The `searchVector` column
 *  is a generated column added by hand in the migration — not part of the
 *  Prisma model — so this always goes through raw SQL. */
export async function searchKnowledge(
  mindmapId: string,
  callerEmail: string,
  query: string,
  limit = 8,
): Promise<KnowledgeSearchResult[]> {
  await requireRead(mindmapId, callerEmail);
  if (!query.trim()) return [];

  return prisma.$queryRaw<KnowledgeSearchResult[]>`
    SELECT "id", "sourceType", "sourceDocumentId", "nodeId", "content",
           ts_rank("searchVector", plainto_tsquery('simple', ${query})) AS "rank"
    FROM "mindmap_knowledge_chunks"
    WHERE "mindmapId" = ${mindmapId}
      AND "searchVector" @@ plainto_tsquery('simple', ${query})
    ORDER BY "rank" DESC
    LIMIT ${limit}
  `;
}

/** Re-syncs the NODE-sourced chunks for a tree. Lives in its own module
 *  (lib/mindmap/knowledge-node-chunks.ts) because it needs to diff against
 *  what is already stored; re-exported here so existing importers — and
 *  lib/mindmap/repository.ts's replaceTree(), which calls it on every tree
 *  save — keep working unchanged. */
export { syncNodeChunksFromTree } from "@/lib/mindmap/knowledge-node-chunks";

export interface HybridSearchResult extends KnowledgeSearchResult {
  fusedScore: number;
}

/** Reciprocal Rank Fusion — combines two independently-ranked result lists
 *  (full-text `ts_rank`, vector cosine similarity) into one ranking, without
 *  needing the two scores to be on comparable scales. `k = 60` is the
 *  standard RRF constant from the original TREC paper; it just controls how
 *  quickly rank position decays, not a magic tuning knob for this data. */
export async function hybridSearchKnowledge(
  mindmapId: string,
  callerEmail: string,
  query: string,
  limit = 8,
): Promise<HybridSearchResult[]> {
  await requireRead(mindmapId, callerEmail);
  if (!query.trim()) return [];

  const [fullText, vector] = await Promise.all([
    prisma.$queryRaw<KnowledgeSearchResult[]>`
      SELECT "id", "sourceType", "sourceDocumentId", "nodeId", "content",
             ts_rank("searchVector", plainto_tsquery('simple', ${query})) AS "rank"
      FROM "mindmap_knowledge_chunks"
      WHERE "mindmapId" = ${mindmapId}
        AND "searchVector" @@ plainto_tsquery('simple', ${query})
      ORDER BY "rank" DESC
      LIMIT 15
    `,
    searchKnowledgeByEmbedding(mindmapId, query, 15),
  ]);

  const K = 60;
  const fused = new Map<string, HybridSearchResult>();
  const accumulate = (results: KnowledgeSearchResult[]) => {
    results.forEach((r, rank) => {
      const existing = fused.get(r.id);
      const contribution = 1 / (K + rank + 1);
      if (existing) existing.fusedScore += contribution;
      else fused.set(r.id, { ...r, fusedScore: contribution });
    });
  };
  accumulate(fullText);
  accumulate(vector);

  return Array.from(fused.values())
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, limit);
}

/** Vector leg of hybrid search. Brute-force cosine similarity in JS over
 *  every chunk in this mindmap that has an embedding — fine at this data
 *  scale (a mindmap's chunk count is bounded by its own canvas + uploaded
 *  docs, not the whole database). See schema.prisma's comment on
 *  MindmapKnowledgeChunk.embedding for why this isn't pgvector. */
async function searchKnowledgeByEmbedding(
  mindmapId: string,
  query: string,
  limit: number,
): Promise<KnowledgeSearchResult[]> {
  const queryVector = await embed(query).catch(() => null);
  if (!queryVector) return [];

  const rows = await prisma.mindmapKnowledgeChunk.findMany({
    where: { mindmapId, embedding: { isEmpty: false } },
    select: { id: true, sourceType: true, sourceDocumentId: true, nodeId: true, content: true, embedding: true },
  });

  return rows
    .map((r) => ({ ...r, rank: cosineSimilarity(queryVector, r.embedding) }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map(({ embedding, ...r }) => r);
}
