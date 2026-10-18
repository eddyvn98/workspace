import { isCollectionBlockPayload } from "./model";

export interface CollectionBoardSnapshot {
  id: string;
  title: string;
  updatedAt: Date | string;
  blocks: unknown;
}

export interface CollectionAppSummary {
  boardId: string;
  blockId: string;
  boardTitle: string;
  title: string;
  recordCount: number;
  viewCount: number;
  updatedAt: string;
}

/** Collection apps are views of the original Workspace blocks, not copies. */
export function listCollectionApps(boards: readonly CollectionBoardSnapshot[]): CollectionAppSummary[] {
  return boards.flatMap((board) => {
    const blocks = board.blocks;
    if (!blocks || typeof blocks !== "object" || Array.isArray(blocks)) return [];
    return Object.entries(blocks).flatMap(([blockId, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const block = value as Record<string, unknown>;
      if (block.type !== "collection" || !isCollectionBlockPayload(block.data)) return [];
      return [{
        boardId: board.id,
        blockId,
        boardTitle: board.title,
        title: block.data.title,
        recordCount: block.data.records.length,
        viewCount: block.data.views.length,
        updatedAt: new Date(board.updatedAt).toISOString(),
      }];
    });
  });
}
