CREATE TABLE IF NOT EXISTS "workspace_board_snapshots" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "blockOrder" JSONB NOT NULL,
    "connectors" JSONB NOT NULL,
    "label" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_board_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workspace_board_snapshots_boardId_createdAt_idx"
    ON "workspace_board_snapshots"("boardId", "createdAt");

ALTER TABLE "workspace_board_snapshots" ADD CONSTRAINT "workspace_board_snapshots_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "workspace_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
