CREATE TYPE "WorkspaceShareRole" AS ENUM ('VIEWER', 'EDITOR');

CREATE TABLE IF NOT EXISTS "workspace_board_shares" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "role" "WorkspaceShareRole" NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_board_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_board_shares_boardId_invitedEmail_key" ON "workspace_board_shares"("boardId", "invitedEmail");
CREATE INDEX IF NOT EXISTS "workspace_board_shares_invitedEmail_idx" ON "workspace_board_shares"("invitedEmail");

ALTER TABLE "workspace_board_shares" ADD CONSTRAINT "workspace_board_shares_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "workspace_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
