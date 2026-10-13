ALTER TABLE "workspace_boards"
    ADD COLUMN IF NOT EXISTS "legacyPublicShareEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "legacyPublicShareToken" TEXT,
    ADD COLUMN IF NOT EXISTS "legacyPublicShareExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_boards_legacyPublicShareToken_key"
    ON "workspace_boards"("legacyPublicShareToken");
