/**
 * lib/workspace/knowledge-repository.ts
 *
 * Per-board document knowledge base: WorkspaceSourceDocument (one row per
 * uploaded file) plus WorkspaceKnowledgeChunk (searchable slices). Workspace
 * twin of lib/mindmap/knowledge-repository.ts.
 *
 * What is NOT re-implemented, because it was already written and is not
 * mindmap-specific: lib/extract-knowledge.ts (PDF/Word/Excel to text),
 * lib/dify-caption.ts (an image has no text of its own, so Dify captions it),
 * and lib/embeddings.ts (384-dim vectors in-process). This module is the part
 * that genuinely differs between the two engines — which tables, and who is
 * allowed to read or write them.
 *
 * Search lives in ./knowledge-search.ts, split at the 300-line cap.
 */

import { prisma } from "@/lib/prisma";
import { resolveAccessRole } from "@/app/api/workspaces/_access";

const MAX_CHUNK_LENGTH = 2000;

/** Mirrors MindmapAccessError, and the status mapping is the workspace API's
 *  established one rather than legacy's: no access at all is NOT_FOUND (404),
 *  never 403, so this route cannot be used to ask whether a board id is real.
 *  A VIEWER is FORBIDDEN (403) on a write, because they already legitimately
 *  know the board exists — the same distinction the board PUT draws. */
export class WorkspaceAccessError extends Error {
  constructor(readonly code: "NOT_FOUND" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

/** Resolves the caller's role by importing the API layer's own helper rather
 *  than re-deriving it here. Deliberate: the case-insensitive identity match
 *  and the 404-not-403 rule are exactly the things that went wrong once by
 *  being written twice, and _access.ts depends on nothing but prisma and
 *  lib/workspace/identity.ts. */
async function roleFor(boardId: string, callerEmail: string) {
  const board = await prisma.workspaceBoard.findUnique({
    where: { id: boardId },
    select: { id: true, ownerEmail: true },
  });
  if (!board) return null;
  return resolveAccessRole(board, callerEmail);
}

async function requireRead(boardId: string, callerEmail: string): Promise<void> {
  if (!(await roleFor(boardId, callerEmail))) {
    throw new WorkspaceAccessError("NOT_FOUND", "Board not found");
  }
}

async function requireWrite(boardId: string, callerEmail: string): Promise<void> {
  const role = await roleFor(boardId, callerEmail);
  if (!role) throw new WorkspaceAccessError("NOT_FOUND", "Board not found");
  if (role === "VIEWER") {
    throw new WorkspaceAccessError("FORBIDDEN", "Read-only access cannot add or remove documents");
  }
}

/** Splits on blank-line paragraph boundaries first, keeping a paragraph whole
 *  when it fits, and hard-slicing one that is too long on its own. Simple on
 *  purpose: a boundary only has to keep a full-text match roughly coherent,
 *  not be semantically perfect. Same rule as legacy's chunkText — copied
 *  rather than imported so lib/workspace/** keeps no dependency on the
 *  mindmap feature (app/workspace/CONTRACTS.md). */
export function chunkText(text: string, maxLen = MAX_CHUNK_LENGTH): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
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
      for (let index = 0; index < paragraph.length; index += maxLen) {
        chunks.push(paragraph.slice(index, index + maxLen));
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

const SUMMARY_FIELDS = {
  id: true,
  filename: true,
  mimeType: true,
  uploadedByEmail: true,
  createdAt: true,
} as const;

export async function addSourceDocument(
  boardId: string,
  callerEmail: string,
  doc: { filename: string; mimeType: string; extractedText: string },
): Promise<SourceDocumentSummary> {
  await requireWrite(boardId, callerEmail);

  const created = await prisma.workspaceSourceDocument.create({
    data: {
      boardId,
      filename: doc.filename,
      mimeType: doc.mimeType,
      extractedText: doc.extractedText,
      uploadedByEmail: callerEmail,
    },
    select: SUMMARY_FIELDS,
  });

  const chunks = chunkText(doc.extractedText);
  if (chunks.length) {
    // Embedding is best-effort on purpose. A slow or failed embed must not
    // stop the chunk being stored, because full-text search still finds it
    // without a vector — losing the upload entirely to protect half of a
    // hybrid search would be the worse trade.
    const { embedAll } = await import("./knowledge-search");
    const embeddings = await embedAll(chunks);
    await prisma.workspaceKnowledgeChunk.createMany({
      data: chunks.map((content, index) => ({
        boardId,
        sourceType: "DOCUMENT" as const,
        sourceDocumentId: created.id,
        content,
        embedding: embeddings[index],
      })),
    });
  }

  return created;
}

export async function requireBoardWrite(boardId: string, callerEmail: string): Promise<void> {
  await requireWrite(boardId, callerEmail);
}

export async function listSourceDocuments(
  boardId: string,
  callerEmail: string,
): Promise<SourceDocumentSummary[]> {
  // Read access, not write: a VIEWER invited to review needs to see what the
  // board's answers are drawn from. Same bar as reading comments.
  await requireRead(boardId, callerEmail);
  return prisma.workspaceSourceDocument.findMany({
    where: { boardId },
    orderBy: { createdAt: "desc" },
    select: SUMMARY_FIELDS,
  });
}

export async function deleteSourceDocument(
  boardId: string,
  callerEmail: string,
  documentId: string,
): Promise<void> {
  await requireWrite(boardId, callerEmail);
  // Scoped to this board, so a document id from another board is not
  // deletable through it even by someone who can write here.
  const doc = await prisma.workspaceSourceDocument.findFirst({
    where: { id: documentId, boardId },
    select: { id: true },
  });
  if (!doc) throw new WorkspaceAccessError("NOT_FOUND", "Document not found");
  // Chunks go with it through the sourceDocumentId cascade, so nothing keeps
  // answering searches out of a file the owner removed.
  await prisma.workspaceSourceDocument.delete({ where: { id: documentId } });
}

export { requireRead as requireBoardRead };
