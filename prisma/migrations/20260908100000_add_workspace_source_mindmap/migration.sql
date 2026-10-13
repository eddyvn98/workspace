ALTER TABLE "workspace_boards"
    ADD COLUMN IF NOT EXISTS "sourceMindmapId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_boards_sourceMindmapId_key"
    ON "workspace_boards"("sourceMindmapId");
