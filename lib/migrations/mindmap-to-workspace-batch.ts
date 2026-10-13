import { prisma } from "@/lib/prisma";
import { migrateMindmapToWorkspace } from "./mindmap-to-workspace";

export interface LegacyMindmapBatchMigrationResult {
  total: number;
  migrated: number;
  alreadyMigrated: number;
  failed: number;
  warnings: string[];
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Converts every legacy map visible to the caller that does not yet have a
 * Workspace counterpart. The source rows are intentionally retained; this is
 * a cutover, not a destructive deletion. Processing is serial so a large
 * account does not overload Postgres while each migration reads the full
 * legacy document and its support data.
 */
export async function migrateAccessibleMindmapsToWorkspace(
  callerEmail: string,
): Promise<LegacyMindmapBatchMigrationResult> {
  const caller = normalizeEmail(callerEmail);
  const legacyMaps = await prisma.mindmap.findMany({
    where: {
      OR: [
        { ownerEmail: { equals: caller, mode: "insensitive" } },
        { shares: { some: { invitedEmail: { equals: caller, mode: "insensitive" } } } },
      ],
      workspaceDeletedAt: null,
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  const ids = legacyMaps.map((map) => map.id);
  if (ids.length === 0) {
    return { total: 0, migrated: 0, alreadyMigrated: 0, failed: 0, warnings: [] };
  }

  const existing = await prisma.workspaceBoard.findMany({
    where: { sourceMindmapId: { in: ids } },
    select: {
      sourceMindmapId: true,
      chatMigrations: { where: { userEmail: caller }, select: { id: true }, take: 1 },
    },
  });
  const existingIds = new Set(
    existing.flatMap((board) => board.sourceMindmapId ? [board.sourceMindmapId] : []),
  );
  const pendingIds = ids.filter((id) => !existingIds.has(id));
  const retryChatIds = existing
    .filter((board) => board.sourceMindmapId && board.chatMigrations.length === 0)
    .map((board) => board.sourceMindmapId!);
  const warnings: string[] = [];
  let migrated = 0;

  for (const mindmapId of [...pendingIds, ...retryChatIds]) {
    try {
      const result = await migrateMindmapToWorkspace(mindmapId, caller);
      if (result.migrated) migrated += 1;
      warnings.push(...result.warnings.map((warning) => `${mindmapId}: ${warning}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Migration failed";
      warnings.push(`${mindmapId}: ${message}`);
    }
  }

  return {
    total: ids.length,
    migrated,
    alreadyMigrated: existingIds.size,
    failed: warnings.length > 0 ? new Set(warnings.map((warning) => warning.split(":", 1)[0])).size : 0,
    warnings,
  };
}
