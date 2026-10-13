ALTER TABLE "workspace_boards"
    ADD COLUMN IF NOT EXISTS "treeLayoutDirection" TEXT,
    ADD COLUMN IF NOT EXISTS "treeGrowthMode" TEXT,
    ADD COLUMN IF NOT EXISTS "treeLayoutFamily" TEXT,
    ADD COLUMN IF NOT EXISTS "treeTimelineBranchMode" TEXT,
    ADD COLUMN IF NOT EXISTS "treeTimelineDescendantStyle" TEXT,
    ADD COLUMN IF NOT EXISTS "treeCatalogDescendantStyle" TEXT;
