ALTER TABLE "workspace_boards"
    ADD COLUMN IF NOT EXISTS "publicShareEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "publicShareToken" TEXT,
    ADD COLUMN IF NOT EXISTS "publicShareExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_boards_publicShareToken_key"
    ON "workspace_boards"("publicShareToken");
