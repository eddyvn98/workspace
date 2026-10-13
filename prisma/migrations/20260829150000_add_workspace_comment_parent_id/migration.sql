ALTER TABLE "workspace_board_comments"
    ADD COLUMN IF NOT EXISTS "parentId" TEXT;

CREATE INDEX IF NOT EXISTS "workspace_board_comments_parentId_idx"
    ON "workspace_board_comments"("parentId");

ALTER TABLE "workspace_board_comments"
    ADD CONSTRAINT "workspace_board_comments_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "workspace_board_comments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
