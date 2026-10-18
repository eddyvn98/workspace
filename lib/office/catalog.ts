import type { WorkspaceAccessRole } from "@/app/api/workspaces/_access";

export type OfficeKind = "document" | "spreadsheet" | "presentation";
export const OFFICE_KINDS: OfficeKind[] = ["document", "spreadsheet", "presentation"];

type BlockRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is BlockRecord =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export interface OfficeFileSummary {
  boardId: string;
  blockId: string;
  kind: OfficeKind;
  title: string;
  boardTitle: string;
  updatedAt: string;
  viewerRole: WorkspaceAccessRole;
}

export interface OfficeBoardSummarySource {
  id: string;
  title: string;
  updatedAt: Date | string;
  blocks: unknown;
  blockOrder?: unknown;
}

/** An Office file is an existing Workspace block, not a copy or another table. */
export function officeKindOfBlock(value: unknown): OfficeKind | null {
  if (!isRecord(value)) return null;
  if (value.type === "doc") return "document";
  if (value.type === "slideDeck") return "presentation";
  if (value.type === "table" && !value.embeddedInDocId
    && !(isRecord(value.data) && value.data.disableCellAttachment === true)) return "spreadsheet";
  return null;
}

export function officeEditorUrl(kind: OfficeKind, boardId: string, blockId: string): string {
  const params = new URLSearchParams({ boardId, blockId });
  return `/office/${kind}?${params.toString()}`;
}

const labels: Record<OfficeKind, string> = {
  document: "Document", spreadsheet: "Spreadsheet", presentation: "Presentation",
};

function orderedBlocks(blocks: unknown, blockOrder: unknown): Array<[string, BlockRecord]> {
  const items = Array.isArray(blocks)
    ? blocks.filter(isRecord).map((block): [string, BlockRecord] => [String(block.id ?? ""), block])
    : isRecord(blocks) ? Object.entries(blocks).filter((pair): pair is [string, BlockRecord] => isRecord(pair[1])) : [];
  const byId = new Map(items.filter(([id]) => Boolean(id)));
  const orderedIds = Array.isArray(blockOrder) ? blockOrder.filter((id): id is string => typeof id === "string") : [];
  return [...new Set([...orderedIds, ...byId.keys()])]
    .filter((id) => byId.has(id))
    .map((id) => [id, byId.get(id)!]);
}

export function listOfficeFilesFromBoard(
  board: OfficeBoardSummarySource, viewerRole: WorkspaceAccessRole,
): OfficeFileSummary[] {
  const candidates = orderedBlocks(board.blocks, board.blockOrder)
    .map(([id, block]) => ({ id, block, kind: officeKindOfBlock(block) }))
    .filter((candidate): candidate is { id: string; block: BlockRecord; kind: OfficeKind } => candidate.kind !== null);
  const perKind: Record<OfficeKind, number> = { document: 0, spreadsheet: 0, presentation: 0 };
  const fallbackDate = new Date(board.updatedAt).toISOString();
  return candidates.map(({ id, block, kind }) => {
    const data = isRecord(block.data) ? block.data : {};
    const index = ++perKind[kind];
    const name = typeof block.officeTitle === "string" && block.officeTitle.trim()
      ? block.officeTitle.trim()
      : kind === "presentation" && typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : candidates.length === 1 ? board.title : `${board.title} - ${labels[kind]} ${index}`;
    const blockDate = typeof block.updatedAt === "number" && Number.isFinite(block.updatedAt)
      ? new Date(block.updatedAt) : null;
    return {
      boardId: board.id, blockId: id, kind, title: name,
      boardTitle: board.title,
      updatedAt: blockDate && !Number.isNaN(blockDate.valueOf()) ? blockDate.toISOString() : fallbackDate,
      viewerRole,
    };
  });
}

/** The editor must not render until the server has confirmed block type and role. */
export function officeFileAccess(
  board: { blocks: unknown; viewerRole?: string } | null, kind: OfficeKind, blockId: string,
): { authorized: boolean; viewer: boolean } {
  const role = board?.viewerRole;
  const viewer = role === "VIEWER";
  if (!board || (role !== "OWNER" && role !== "EDITOR" && role !== "VIEWER")) {
    return { authorized: false, viewer: true };
  }
  const blocks = board.blocks;
  const block = Array.isArray(blocks)
    ? blocks.find((item) => isRecord(item) && item.id === blockId)
    : isRecord(blocks) ? blocks[blockId] : undefined;
  return { authorized: officeKindOfBlock(block) === kind, viewer };
}
