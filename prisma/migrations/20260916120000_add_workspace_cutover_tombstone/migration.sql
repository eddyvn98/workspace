ALTER TABLE "mindmaps"
  ADD COLUMN IF NOT EXISTS "workspaceDeletedAt" TIMESTAMP(3);
