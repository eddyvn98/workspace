CREATE TABLE IF NOT EXISTS "workspace_presence" (
    "boardId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_presence_pkey" PRIMARY KEY ("boardId", "email")
);

ALTER TABLE "workspace_presence" ADD CONSTRAINT "workspace_presence_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "workspace_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
