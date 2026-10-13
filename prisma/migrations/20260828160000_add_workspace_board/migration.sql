CREATE TABLE IF NOT EXISTS "workspace_boards" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "blocks" JSONB NOT NULL,
    "blockOrder" JSONB NOT NULL,
    "connectors" JSONB NOT NULL,
    "camera" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_boards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workspace_boards_ownerEmail_idx" ON "workspace_boards"("ownerEmail");
