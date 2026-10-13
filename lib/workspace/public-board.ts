import { prisma } from "@/lib/prisma";
import { migrateMindmapToWorkspace } from "@/lib/migrations/mindmap-to-workspace";

export async function findPublicWorkspaceBoard(token: string) {
  const board = await prisma.workspaceBoard.findFirst({
    where: {
      OR: [
        { publicShareToken: token },
        { legacyPublicShareToken: token },
      ],
    },
  });
  if (!board) return null;

  const isLegacyAlias = board.publicShareToken !== token;
  const enabled = isLegacyAlias ? board.legacyPublicShareEnabled : board.publicShareEnabled;
  const expiresAt = isLegacyAlias ? board.legacyPublicShareExpiresAt : board.publicShareExpiresAt;
  if (!enabled || (expiresAt !== null && expiresAt <= new Date())) return null;
  return board;
}

export async function ensurePublicWorkspaceBoard(token: string) {
  const existing = await findPublicWorkspaceBoard(token);
  if (existing) return existing;

  const legacy = await prisma.mindmap.findFirst({ where: { publicViewToken: token } });
  if (
    !legacy ||
    !legacy.publicViewEnabled ||
    (legacy.publicViewExpiresAt !== null && legacy.publicViewExpiresAt <= new Date())
  ) return null;

  await migrateMindmapToWorkspace(legacy.id, legacy.ownerEmail);
  return findPublicWorkspaceBoard(token);
}

export function publicWorkspaceBoardPayload(board: {
  id: string;
  title: string;
  blocks: unknown;
  blockOrder: unknown;
  connectors: unknown;
  camera: unknown;
  treeLayoutDirection: string | null;
  treeGrowthMode: string | null;
  treeLayoutFamily: string | null;
  treeTimelineBranchMode: string | null;
  treeTimelineDescendantStyle: string | null;
  treeCatalogDescendantStyle: string | null;
}) {
  return {
    id: board.id,
    title: board.title,
    blocks: board.blocks,
    blockOrder: board.blockOrder,
    connectors: board.connectors,
    camera: board.camera,
    treeLayoutDirection: board.treeLayoutDirection,
    treeGrowthMode: board.treeGrowthMode,
    treeLayoutFamily: board.treeLayoutFamily,
    treeTimelineBranchMode: board.treeTimelineBranchMode,
    treeTimelineDescendantStyle: board.treeTimelineDescendantStyle,
    treeCatalogDescendantStyle: board.treeCatalogDescendantStyle,
    viewerRole: "VIEWER" as const,
  };
}
