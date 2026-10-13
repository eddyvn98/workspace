import { upsertChatSession } from "@/services/mongodb/chatSessions.repo";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function email(value: string): string {
  return value.trim().toLowerCase();
}

export async function migrateLegacyChatSessions(
  sessions: Array<{
    id: string;
    createdByEmail: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    messages: Array<{ id: string; role: string; content: string; attachments: unknown; createdAt: Date }>;
  }>,
  mindmapId: string,
  boardId: string,
  callerEmail: string,
): Promise<void> {
  const caller = email(callerEmail);
  for (const session of sessions) {
    if (email(session.createdByEmail) !== caller) continue;
    await upsertChatSession({
      userId: caller,
      category: "CHAT_KEY",
      difyConversationId: `legacy-mindmap:${mindmapId}:${session.id}`,
      title: session.title,
      workspaceBoardId: boardId,
      workspaceMessages: session.messages.map((message) => ({
        id: message.id,
        role: message.role.toLowerCase(),
        content: message.content,
        attachments: message.attachments ?? undefined,
        createdAt: message.createdAt.toISOString(),
      })),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  }
}

export function legacyPublicFields(source: {
  publicViewEnabled: boolean;
  publicViewToken: string | null;
  publicViewExpiresAt: Date | null;
}) {
  const enabled = Boolean(source.publicViewEnabled && source.publicViewToken);
  return {
    publicShareEnabled: enabled,
    publicShareToken: enabled ? source.publicViewToken : null,
    publicShareExpiresAt: enabled ? source.publicViewExpiresAt : null,
    legacyPublicShareEnabled: enabled,
    legacyPublicShareToken: enabled ? source.publicViewToken : null,
    legacyPublicShareExpiresAt: enabled ? source.publicViewExpiresAt : null,
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function backfillLegacyMapSettings(
  boardId: string,
  migratedBlocks: Record<string, unknown>,
): Promise<void> {
  const board = await prisma.workspaceBoard.findUnique({ where: { id: boardId }, select: { blocks: true } });
  if (!board) return;
  const blocks = objectRecord(board.blocks);
  let changed = false;
  for (const [blockId, migrated] of Object.entries(migratedBlocks)) {
    const migratedBlock = objectRecord(migrated);
    const migratedData = objectRecord(migratedBlock.data);
    const incomingLegacy = objectRecord(migratedData.legacyMindmap);
    if (Object.keys(incomingLegacy).length === 0 || !blocks[blockId]) continue;
    const current = objectRecord(blocks[blockId]);
    const currentData = objectRecord(current.data);
    const currentLegacy = objectRecord(currentData.legacyMindmap);
    const mergedLegacy = { ...incomingLegacy, ...currentLegacy };
    const incomingLayout = objectRecord(migratedBlock.mapLayout);
    const currentLayout = objectRecord(current.mapLayout);
    const repairLegacyPalette = currentLayout.stylePresetId === "legacy-migrated" && typeof incomingLayout.stylePresetId === "string";
    const isLegacyTable = migratedBlock.type === "table" && current.type === "text" && Boolean(currentLegacy.table || currentLegacy.tableV2);
    const hasNewMetadata = Object.keys(incomingLegacy).some((key) => currentLegacy[key] === undefined);
    if (!isLegacyTable && !hasNewMetadata && !repairLegacyPalette) continue;
    blocks[blockId] = {
      ...current,
      ...(isLegacyTable ? { type: "table" } : {}),
      ...(repairLegacyPalette ? { mapLayout: { ...incomingLayout, ...currentLayout, stylePresetId: incomingLayout.stylePresetId, connectorPaletteId: incomingLayout.connectorPaletteId } } : {}),
      data: isLegacyTable ? { ...migratedData, legacyMindmap: mergedLegacy } : { ...currentData, legacyMindmap: mergedLegacy },
    };
    changed = true;
  }
  if (changed) await prisma.workspaceBoard.update({ where: { id: boardId }, data: { blocks: blocks as object } });
}

export async function backfillLegacySnapshotRevisions(
  boardId: string,
  snapshots: Array<{ id: string; baseRevision: number | null }>,
): Promise<void> {
  const updates = snapshots
    .filter((snapshot) => snapshot.baseRevision !== null)
    .map((snapshot) => prisma.workspaceBoardSnapshot.updateMany({
      where: { id: snapshot.id, boardId, legacyBaseRevision: null },
      data: { legacyBaseRevision: snapshot.baseRevision },
    }));
  if (updates.length > 0) await prisma.$transaction(updates);
}

export async function backfillLegacyMapEditEvents(
  boardId: string,
  events: Array<{ id: string; actorEmail: string; opType: string; payload: Uint8Array; nodeVersions: unknown; nodeIds: string[]; createdAt: Date }>,
  rootBlockId: string | undefined,
): Promise<void> {
  if (!rootBlockId) return;
  const mapEvents = events.filter((event) => event.nodeIds.length === 0);
  const rows = mapEvents.map((event) => ({
    id: `${event.id}:map`,
    boardId,
    blockId: rootBlockId,
    actorEmail: email(event.actorEmail),
    opType: `map.${event.opType}`,
    blockVersion: {
      legacyScope: "map",
      legacyEventId: event.id,
      nodeVersions: event.nodeVersions ?? undefined,
      payloadBase64: event.payload.length > 0 ? Buffer.from(event.payload).toString("base64") : undefined,
    } as Prisma.InputJsonValue,
    createdAt: event.createdAt,
  }));
  if (rows.length > 0) await prisma.workspaceBoardEditEvent.createMany({ data: rows, skipDuplicates: true });
  const latest = [...mapEvents].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  if (!latest) return;
  const board = await prisma.workspaceBoard.findUnique({ where: { id: boardId }, select: { blocks: true } });
  const blocks = objectRecord(board?.blocks);
  const root = objectRecord(blocks[rootBlockId]);
  if (root.lastEditedBy || !blocks[rootBlockId]) return;
  blocks[rootBlockId] = { ...root, lastEditedBy: email(latest.actorEmail) };
  await prisma.workspaceBoard.update({ where: { id: boardId }, data: { blocks: blocks as object } });
}

interface LegacyDocumentChunk {
  id: string;
  content: string;
  createdAt: Date;
  embedding: number[];
}

interface LegacyDocument {
  id: string;
  filename: string;
  mimeType: string;
  extractedText: string;
  uploadedByEmail: string;
  createdAt: Date;
  chunks: LegacyDocumentChunk[];
}

interface LegacyKnowledgeChunk {
  id: string;
  sourceType: "DOCUMENT" | "NODE";
  sourceDocumentId: string | null;
  nodeId: string | null;
  content: string;
  createdAt: Date;
  embedding: number[];
}

export async function backfillLegacyKnowledge(
  boardId: string,
  documents: LegacyDocument[],
  chunks: LegacyKnowledgeChunk[],
  blockIdByMindmapId: Map<string, string>,
): Promise<void> {
  const documentChunkIds = new Set(documents.flatMap((document) => document.chunks.map((chunk) => chunk.id)));
  const documentRows = documents.flatMap((document) => document.chunks.map((chunk) => ({
    id: chunk.id,
    boardId,
    sourceType: "DOCUMENT" as const,
    sourceDocumentId: document.id,
    content: chunk.content,
    createdAt: chunk.createdAt,
    embedding: chunk.embedding,
  })));
  const orphanDocumentRows = chunks
    .filter((chunk) => chunk.sourceType === "DOCUMENT" && !documentChunkIds.has(chunk.id))
    .map((chunk) => ({
      id: chunk.id,
      boardId,
      sourceType: "DOCUMENT" as const,
      sourceDocumentId: documents.some((document) => document.id === chunk.sourceDocumentId)
        ? chunk.sourceDocumentId ?? undefined
        : undefined,
      content: chunk.content,
      createdAt: chunk.createdAt,
      embedding: chunk.embedding,
    }));
  const nodeRows = chunks
    .filter((chunk) => chunk.sourceType === "NODE")
    .map((chunk) => ({
      id: chunk.id,
      boardId,
      sourceType: "BLOCK" as const,
      blockId: chunk.nodeId ? blockIdByMindmapId.get(chunk.nodeId) : undefined,
      content: chunk.content,
      createdAt: chunk.createdAt,
      embedding: chunk.embedding,
    }));

  await prisma.$transaction(async (tx) => {
    if (documents.length > 0) {
      await tx.workspaceSourceDocument.createMany({
        data: documents.map((document) => ({
          id: document.id,
          boardId,
          filename: document.filename,
          mimeType: document.mimeType,
          extractedText: document.extractedText,
          uploadedByEmail: email(document.uploadedByEmail),
          createdAt: document.createdAt,
        })),
        skipDuplicates: true,
      });
    }
    const rows = [...documentRows, ...orphanDocumentRows, ...nodeRows];
    if (rows.length > 0) {
      await tx.workspaceKnowledgeChunk.createMany({ data: rows, skipDuplicates: true });
    }
  });
}
