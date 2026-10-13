CREATE TABLE IF NOT EXISTS "workspace_board_edit_events" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "opType" TEXT NOT NULL,
    "blockVersion" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_board_edit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workspace_board_edit_events_boardId_blockId_createdAt_idx"
    ON "workspace_board_edit_events"("boardId", "blockId", "createdAt");

ALTER TABLE "workspace_board_edit_events"
    ADD CONSTRAINT "workspace_board_edit_events_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "workspace_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
