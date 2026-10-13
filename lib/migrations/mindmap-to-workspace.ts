import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMindmap, type MindmapNodeLike } from "@/lib/mindmap/repository";
import { convertMindmapToWorkspaceContent } from "./mindmap-to-workspace-content";
import { backfillLegacyKnowledge, backfillLegacyMapEditEvents, backfillLegacyMapSettings, backfillLegacySnapshotRevisions, legacyPublicFields, migrateLegacyChatSessions } from "./mindmap-to-workspace-support";

export interface MindmapWorkspaceMigrationResult {
  boardId: string;
  migrated: boolean;
  warnings: string[];
}
function email(value: string): string {
  return value.trim().toLowerCase();
}
function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
function notificationType(value: string): "NEW_COMMENT" | "REPLY" | "SHARE_INVITE" | "SHARE_LEFT" {
  if (value === "REPLY") return "REPLY";
  if (value === "SHARE_INVITE") return "SHARE_INVITE";
  if (value === "SHARE_LEFT") return "SHARE_LEFT";
  return "NEW_COMMENT";
}
function blockVersion(event: Record<string, unknown>, blockId: string): Prisma.InputJsonValue {
  const versions = event.nodeVersions && typeof event.nodeVersions === "object"
    ? event.nodeVersions as Record<string, unknown>
    : undefined;
  const payload = event.payload;
  return json({
    legacyEventId: event.id,
    nodeVersion: versions?.[blockId],
    payloadBase64: payload && Buffer.isBuffer(payload) ? payload.toString("base64") : undefined,
  });
}

/** Chat history lives in Mongo rather than the transactional Postgres data.
 * Do not let an unavailable Mongo server hold the Workspace cutover open for
 * its driver-level 30s selection timeout; the board itself is already safely
 * migrated and the support data can be retried later. */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function migrateChatForUser(
  boardId: string,
  mindmapId: string,
  sessions: Parameters<typeof migrateLegacyChatSessions>[0],
  callerEmail: string,
): Promise<void> {
  const userEmail = email(callerEmail);
  const marker = await prisma.workspaceBoardChatMigration.findUnique({
    where: { boardId_userEmail: { boardId, userEmail } },
    select: { id: true },
  });
  if (marker) return;

  await withTimeout(
    migrateLegacyChatSessions(sessions, mindmapId, boardId, userEmail),
    5000,
    "Legacy chat migration timed out",
  );
  await prisma.workspaceBoardChatMigration.upsert({
    where: { boardId_userEmail: { boardId, userEmail } },
    update: { migratedAt: new Date() },
    create: { boardId, userEmail },
  });
}

export async function migrateMindmapToWorkspace(
  mindmapId: string,
  callerEmail: string,
): Promise<MindmapWorkspaceMigrationResult> {
  // Authorize against the legacy record before revealing whether a mapping
  // already exists. The mapping is a redirect credential, not a public index.
  const record = await getMindmap(mindmapId, callerEmail);
  const existing = await prisma.workspaceBoard.findUnique({ where: { sourceMindmapId: mindmapId } });
  const source = await prisma.mindmap.findUnique({
    where: { id: mindmapId },
    include: {
      shares: true,
      comments: true,
      notifications: true,
      sidebarHides: true,
      views: true,
      snapshots: true,
      editEvents: true,
      sourceDocuments: { include: { chunks: true } },
      knowledgeChunks: true,
      chatSessions: { include: { messages: true } },
    },
  });
  if (!source) throw new Error("Mindmap not found");
  if (source.workspaceDeletedAt) throw new Error("Mindmap was deleted from Workspace");
  if (existing) {
    const publicFields = legacyPublicFields(source);
    const wasNotEditedAfterMigration = existing.updatedAt.getTime() === source.updatedAt.getTime();
    const metadataPatch = wasNotEditedAfterMigration
      ? { revision: source.revision, shareFullHistory: source.shareFullHistory }
      : {};
    const legacyPublicPatch = publicFields.legacyPublicShareToken && !existing.legacyPublicShareToken
      ? {
          legacyPublicShareEnabled: publicFields.legacyPublicShareEnabled,
          legacyPublicShareToken: publicFields.legacyPublicShareToken,
          legacyPublicShareExpiresAt: publicFields.legacyPublicShareExpiresAt,
        }
      : {};
    if (Object.keys(metadataPatch).length > 0 || Object.keys(legacyPublicPatch).length > 0) {
      await prisma.workspaceBoard.update({
        where: { id: existing.id },
        data: { ...metadataPatch, ...legacyPublicPatch },
      });
    }
    try {
      await backfillLegacyMapSettings(existing.id, convertMindmapToWorkspaceContent(record).blocks);
    } catch (error) {
      console.error("[mindmap-to-workspace] legacy map settings backfill deferred", error);
      return { boardId: existing.id, migrated: false, warnings: ["Legacy map settings backfill deferred"] };
    }
    await backfillLegacySnapshotRevisions(existing.id, source.snapshots);
    await backfillLegacyMapEditEvents(existing.id, source.editEvents, convertMindmapToWorkspaceContent(record).blockOrder[0]);
    try {
      await backfillLegacyKnowledge(existing.id, source.sourceDocuments, source.knowledgeChunks, convertMindmapToWorkspaceContent(record).blockIdByMindmapId);
    } catch (error) {
      console.error("[mindmap-to-workspace] legacy knowledge backfill deferred", error);
      return { boardId: existing.id, migrated: false, warnings: ["Legacy knowledge backfill deferred"] };
    }
    try {
      await migrateChatForUser(existing.id, mindmapId, source.chatSessions, callerEmail);
    } catch (error) {
      console.error("[mindmap-to-workspace] legacy chat migration deferred", error);
      return { boardId: existing.id, migrated: false, warnings: ["Legacy chat history migration deferred"] };
    }
    return { boardId: existing.id, migrated: false, warnings: [] };
  }

  const content = convertMindmapToWorkspaceContent(record);
  const ownerEmail = email(record.ownerEmail);
  const boardId = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      const raced = await tx.workspaceBoard.findUnique({ where: { sourceMindmapId: mindmapId } });
      if (raced) return;
      await tx.workspaceBoard.create({
        data: {
          id: boardId,
          sourceMindmapId: mindmapId,
          ownerEmail,
          title: record.title,
          revision: record.revision,
          blocks: json(content.blocks),
          blockOrder: json(content.blockOrder),
          connectors: json(content.connectors),
          camera: json(content.camera),
          treeLayoutDirection: content.treeLayoutDirection,
          treeGrowthMode: content.treeGrowthMode,
          treeLayoutFamily: content.treeLayoutFamily,
          treeTimelineBranchMode: content.treeTimelineBranchMode,
          treeTimelineDescendantStyle: content.treeTimelineDescendantStyle,
          treeCatalogDescendantStyle: content.treeCatalogDescendantStyle,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          shareFullHistory: source.shareFullHistory,
          ...legacyPublicFields(source),
        },
      });

      if (source.shares.length > 0) {
        await tx.workspaceBoardShare.createMany({
          data: source.shares.map((share) => ({
            id: share.id,
            boardId,
            invitedEmail: email(share.invitedEmail),
            role: share.role,
            invitedBy: email(share.invitedBy),
            createdAt: share.createdAt,
            updatedAt: share.updatedAt,
          })),
        });
      }
      if (source.comments.length > 0) {
        const comments = source.comments.map((comment) => ({
          id: comment.id,
          boardId,
          blockId: content.blockIdByMindmapId.get(comment.nodeId) ?? comment.nodeId,
          authorEmail: email(comment.authorEmail),
          body: comment.body,
          resolved: comment.resolved,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
          parentId: comment.parentCommentId,
        }));
        const blockIds = new Set(Object.keys(content.blocks));
        const valid = comments.filter((comment) => blockIds.has(comment.blockId));
        const skipped = comments.length - valid.length;
        if (skipped > 0) content.warnings.push(`Skipped ${skipped} comments anchored to missing nodes`);
        const topLevel = valid.filter((comment) => !comment.parentId);
        if (topLevel.length > 0) await tx.workspaceBoardComment.createMany({ data: topLevel });
        for (const comment of valid.filter((item) => item.parentId)) {
          if (!comment.parentId || !valid.some((row) => row.id === comment.parentId)) continue;
          await tx.workspaceBoardComment.create({ data: comment });
        }
      }
      if (source.sidebarHides.length > 0) {
        await tx.workspaceBoardHide.createMany({
          data: source.sidebarHides.map((hide) => ({ id: hide.id, boardId, userEmail: email(hide.userEmail), hiddenAt: hide.hiddenAt })),
        });
      }
      if (source.views.length > 0) {
        await tx.workspaceBoardView.createMany({
          data: source.views.map((view) => ({ id: view.id, boardId, userEmail: email(view.userEmail), lastSeenAt: view.lastSeenAt })),
        });
      }
      if (source.notifications.length > 0) {
        await tx.workspaceNotification.createMany({
          data: source.notifications.map((notice) => ({
            id: notice.id,
            boardId,
            recipientEmail: email(notice.recipientEmail),
            type: notificationType(notice.type),
            body: notice.bodyPreview,
            read: notice.read,
            createdAt: notice.createdAt,
            blockId: content.blockIdByMindmapId.get(notice.nodeId),
            commentId: notice.commentId || undefined,
            actorEmail: email(notice.actorEmail),
          })),
        });
      }
      for (const document of source.sourceDocuments) {
        await tx.workspaceSourceDocument.create({
          data: {
            id: document.id,
            boardId,
            filename: document.filename,
            mimeType: document.mimeType,
            extractedText: document.extractedText,
            uploadedByEmail: email(document.uploadedByEmail),
            createdAt: document.createdAt,
          },
        });
        if (document.chunks.length > 0) {
          await tx.workspaceKnowledgeChunk.createMany({
            data: document.chunks.map((chunk) => ({
              id: chunk.id,
              boardId,
              sourceType: "DOCUMENT",
              sourceDocumentId: document.id,
              content: chunk.content,
              createdAt: chunk.createdAt,
              embedding: chunk.embedding,
            })),
          });
        }
      }
      const nodeChunks = source.knowledgeChunks.filter((chunk) => chunk.sourceType === "NODE");
      if (nodeChunks.length > 0) {
        await tx.workspaceKnowledgeChunk.createMany({
          data: nodeChunks.map((chunk) => ({
            id: chunk.id,
            boardId,
            sourceType: "BLOCK",
            blockId: chunk.nodeId ? content.blockIdByMindmapId.get(chunk.nodeId) : undefined,
            content: chunk.content,
            createdAt: chunk.createdAt,
            embedding: chunk.embedding,
          })),
        });
      }
      const snapshots = source.snapshots.map((snapshot) => {
        const snapshotRecord = { ...record, tree: snapshot.treeJson as unknown as MindmapNodeLike };
        const snapshotContent = convertMindmapToWorkspaceContent(snapshotRecord);
        return {
          id: snapshot.id,
          boardId,
          blocks: json(snapshotContent.blocks),
          blockOrder: json(snapshotContent.blockOrder),
          connectors: json(snapshotContent.connectors),
          label: snapshot.label,
          createdBy: email(snapshot.createdBy),
          createdAt: snapshot.createdAt,
          legacyBaseRevision: snapshot.baseRevision,
        };
      });
      if (snapshots.length > 0) await tx.workspaceBoardSnapshot.createMany({ data: snapshots });
      else await tx.workspaceBoardSnapshot.create({ data: {
        boardId, blocks: json(content.blocks), blockOrder: json(content.blockOrder), connectors: json(content.connectors),
        label: "Migrated from Mindmap", createdBy: ownerEmail, createdAt: record.updatedAt,
      } });
      for (const event of source.editEvents) {
        const nodeIds = event.nodeIds.filter((nodeId) => content.blockIdByMindmapId.has(nodeId));
        if (nodeIds.length === 0) continue;
        await tx.workspaceBoardEditEvent.createMany({
          data: nodeIds.map((nodeId) => ({
            id: `${event.id}:${nodeId}`,
            boardId,
            blockId: content.blockIdByMindmapId.get(nodeId)!,
            actorEmail: email(event.actorEmail),
            opType: event.opType,
            blockVersion: blockVersion(event as unknown as Record<string, unknown>, nodeId),
            createdAt: event.createdAt,
          })),
        });
      }
    });
    try {
      await backfillLegacyKnowledge(boardId, source.sourceDocuments, source.knowledgeChunks, content.blockIdByMindmapId);
    } catch (error) {
      console.error("[mindmap-to-workspace] legacy knowledge backfill deferred", error);
      content.warnings.push("Legacy knowledge backfill deferred");
    }
    try {
      await backfillLegacyMapEditEvents(boardId, source.editEvents, content.blockOrder[0]);
    } catch (error) {
      console.error("[mindmap-to-workspace] legacy map edit history backfill deferred", error);
      content.warnings.push("Legacy map edit history backfill deferred");
    }
    try {
      await migrateChatForUser(boardId, mindmapId, source.chatSessions, callerEmail);
    } catch (error) {
      console.error("[mindmap-to-workspace] legacy chat migration deferred", error);
      content.warnings.push("Legacy chat history migration deferred");
    }
  } catch (error) {
    const errorCode = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
    if (errorCode === "P2002") {
      const raced = await prisma.workspaceBoard.findUniqueOrThrow({ where: { sourceMindmapId: mindmapId } });
      return { boardId: raced.id, migrated: false, warnings: [] };
    }
    throw error;
  }

  return { boardId, migrated: true, warnings: content.warnings };
}
