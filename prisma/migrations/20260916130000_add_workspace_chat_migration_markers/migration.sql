CREATE TABLE IF NOT EXISTS "workspace_board_chat_migrations" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "migratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_board_chat_migrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_board_chat_migrations_boardId_userEmail_key"
    ON "workspace_board_chat_migrations"("boardId", "userEmail");
CREATE INDEX IF NOT EXISTS "workspace_board_chat_migrations_userEmail_idx"
    ON "workspace_board_chat_migrations"("userEmail");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_board_chat_migrations_boardId_fkey'
  ) THEN
    ALTER TABLE "workspace_board_chat_migrations"
      ADD CONSTRAINT "workspace_board_chat_migrations_boardId_fkey"
      FOREIGN KEY ("boardId") REFERENCES "workspace_boards"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
