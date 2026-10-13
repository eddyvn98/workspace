CREATE TABLE IF NOT EXISTS "workspace_board_comments" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_board_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workspace_board_comments_boardId_blockId_idx" ON "workspace_board_comments"("boardId", "blockId");

ALTER TABLE "workspace_board_comments" ADD CONSTRAINT "workspace_board_comments_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "workspace_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
