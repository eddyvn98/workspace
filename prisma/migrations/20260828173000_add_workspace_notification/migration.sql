CREATE TYPE "WorkspaceNotificationType" AS ENUM ('NEW_COMMENT', 'SHARE_INVITE');

CREATE TABLE IF NOT EXISTS "workspace_notifications" (
    "id" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "type" "WorkspaceNotificationType" NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workspace_notifications_recipientEmail_read_idx" ON "workspace_notifications"("recipientEmail", "read");

ALTER TABLE "workspace_notifications" ADD CONSTRAINT "workspace_notifications_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "workspace_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
