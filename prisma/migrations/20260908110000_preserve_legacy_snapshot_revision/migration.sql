ALTER TABLE "workspace_board_snapshots"
  ADD COLUMN IF NOT EXISTS "legacyBaseRevision" INTEGER;
