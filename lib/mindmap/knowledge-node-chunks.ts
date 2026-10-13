/**
 * lib/mindmap/knowledge-node-chunks.ts
 *
 * Keeps the NODE-sourced knowledge chunks in step with the canvas.
 *
 * This runs on every tree save. The original implementation deleted all NODE
 * chunks and rebuilt them, which meant re-embedding every node in the map on
 * every save — by far the most expensive part of saving, and entirely wasted
 * for the nodes whose text did not change (embedding is a local model run per
 * node). It also left the map with zero searchable node chunks for the
 * duration of the rebuild.
 *
 * So: compare each node's text against the chunk already stored for it and
 * only touch what moved. Unchanged nodes cost one comparison and no embed.
 *
 * No access check here — the caller (repository.replaceTree) is already
 * invoked from an access-checked write path.
 */

import { prisma } from "@/lib/prisma";
import type { MindmapNodeLike } from "@/lib/mindmap/repository";
import { embed } from "@/lib/embeddings";

const EMBEDDING_CONCURRENCY = 2;

interface ChangedNodeChunk {
	nodeId: string;
	content: string;
	chunkId?: string;
}

function collectNodeTexts(tree: MindmapNodeLike): Map<string, string> {
  const byNodeId = new Map<string, string>();
  const visit = (node: MindmapNodeLike) => {
    const content = [node.topic, node.description].filter(Boolean).join("\n").trim();
    if (content && node.id) byNodeId.set(node.id, content);
    (node.children ?? []).forEach(visit);
  };
  visit(tree);
  return byNodeId;
}

export async function syncNodeChunksFromTree(mindmapId: string, tree: MindmapNodeLike): Promise<void> {
  const wanted = collectNodeTexts(tree);
  const stored = await prisma.mindmapKnowledgeChunk.findMany({
    where: { mindmapId, sourceType: "NODE" },
    select: { id: true, nodeId: true, content: true },
  });

  const storedByNodeId = new Map<string, { id: string; content: string }>();
  const staleChunkIds: string[] = [];
  for (const chunk of stored) {
    // A chunk with no nodeId, or a duplicate for the same node left by an
    // older rebuild, has nothing to keep it in sync with — drop it.
    if (!chunk.nodeId || storedByNodeId.has(chunk.nodeId)) {
      staleChunkIds.push(chunk.id);
      continue;
    }
    storedByNodeId.set(chunk.nodeId, { id: chunk.id, content: chunk.content });
  }

  for (const [nodeId, existing] of storedByNodeId) {
    if (!wanted.has(nodeId)) staleChunkIds.push(existing.id);
  }

  const toCreate: { nodeId: string; content: string }[] = [];
  const toUpdate: { id: string; nodeId: string; content: string }[] = [];
  for (const [nodeId, content] of wanted) {
    const existing = storedByNodeId.get(nodeId);
    if (!existing) toCreate.push({ nodeId, content });
    else if (existing.content !== content) toUpdate.push({ id: existing.id, nodeId, content });
  }

  const changed: ChangedNodeChunk[] = [
    ...toCreate,
    ...toUpdate.map(({ id: chunkId, nodeId, content }) => ({ chunkId, nodeId, content })),
  ];

  await prisma.$transaction([
    ...(staleChunkIds.length
      ? [prisma.mindmapKnowledgeChunk.deleteMany({ where: { id: { in: staleChunkIds } } })]
      : []),
    ...(toCreate.length
      ? [prisma.mindmapKnowledgeChunk.createMany({
          data: toCreate.map((row) => ({
            mindmapId,
            sourceType: "NODE" as const,
            nodeId: row.nodeId,
            content: row.content,
            // Full-text search is immediately usable. Vector search is
            // refreshed below without holding up the tree save.
            embedding: [],
          })),
        })]
      : []),
    ...toUpdate.map((row) =>
      prisma.mindmapKnowledgeChunk.update({
        where: { id: row.id },
        data: { content: row.content, embedding: [] },
      }),
    ),
  ]);

  if (changed.length > 0) {
    // The local transformer can take noticeable time on a large first save.
    // Do not make the canvas wait for vector indexing: FTS already has the
    // current content, and this guarded update prevents an older embedding
    // job from overwriting a newer edit that arrived while it was running.
    void refreshNodeChunkEmbeddings(mindmapId, changed).catch((error) => {
      console.warn("Mindmap node embedding refresh failed", error);
    });
  }
}

async function refreshNodeChunkEmbeddings(mindmapId: string, changed: ChangedNodeChunk[]): Promise<void> {
  for (let offset = 0; offset < changed.length; offset += EMBEDDING_CONCURRENCY) {
    const batch = changed.slice(offset, offset + EMBEDDING_CONCURRENCY);
    await Promise.all(batch.map(async (row) => {
      const embedding = await embed(row.content).catch(() => null);
      if (!embedding?.length) return;

      await prisma.mindmapKnowledgeChunk.updateMany({
        where: {
          ...(row.chunkId ? { id: row.chunkId } : {}),
          mindmapId,
          sourceType: "NODE",
          nodeId: row.nodeId,
          content: row.content,
        },
        data: { embedding },
      });
    }));
  }
}
