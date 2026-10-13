-- Owner's pre-invite edit-history privacy toggle (mirrors mindmaps.shareFullHistory).
ALTER TABLE "workspace_boards"
    ADD COLUMN IF NOT EXISTS "shareFullHistory" BOOLEAN NOT NULL DEFAULT false;

-- Notification anchor + actor, so the bell can deep-link a block/comment.
ALTER TABLE "workspace_notifications"
    ADD COLUMN IF NOT EXISTS "blockId" TEXT,
    ADD COLUMN IF NOT EXISTS "commentId" TEXT,
    ADD COLUMN IF NOT EXISTS "actorEmail" TEXT;

-- "A collaborator left your board" notification type.
ALTER TYPE "WorkspaceNotificationType" ADD VALUE IF NOT EXISTS 'SHARE_LEFT';

-- Per-user hidden-board preference, previously localStorage-only.
CREATE TABLE IF NOT EXISTS "workspace_board_hides" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_board_hides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_board_hides_boardId_userEmail_key"
    ON "workspace_board_hides" ("boardId", "userEmail");
CREATE INDEX IF NOT EXISTS "workspace_board_hides_userEmail_hiddenAt_idx"
    ON "workspace_board_hides" ("userEmail", "hiddenAt");

-- Per-viewer "last opened at" watermark powering the unseen-updates dot.
CREATE TABLE IF NOT EXISTS "workspace_board_views" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_board_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_board_views_boardId_userEmail_key"
    ON "workspace_board_views" ("boardId", "userEmail");
CREATE INDEX IF NOT EXISTS "workspace_board_views_userEmail_idx"
    ON "workspace_board_views" ("userEmail");

DO $$
BEGIN
    ALTER TABLE "workspace_board_hides"
        ADD CONSTRAINT "workspace_board_hides_boardId_fkey"
        FOREIGN KEY ("boardId") REFERENCES "workspace_boards" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_board_views"
        ADD CONSTRAINT "workspace_board_views_boardId_fkey"
        FOREIGN KEY ("boardId") REFERENCES "workspace_boards" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
