ALTER TABLE "workspace_presence"
    ADD COLUMN IF NOT EXISTS "selectedBlockId" TEXT;
