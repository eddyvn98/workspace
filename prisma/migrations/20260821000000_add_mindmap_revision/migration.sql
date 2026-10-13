-- Monotonic version of a mindmap record, bumped inside the same transaction as
-- every write. Replaces wall-clock comparison as the way the REST app and the
-- realtime snapshot worker order their writes against each other.
--
-- Existing rows start at 0. That is safe: the first write after this migration
-- bumps them to 1, and any writer that had cached a revision from before the
-- column existed sends none at all, which is refused rather than applied.
-- AlterTable
ALTER TABLE "mindmaps" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

-- Which repository revision the Y.Doc behind a snapshot had been synced to.
-- Nullable: snapshots taken before this column existed carry no revision, and
-- a room reopening on one of those falls back to the repository tree.
-- AlterTable
ALTER TABLE "mindmap_snapshots" ADD COLUMN "baseRevision" INTEGER;
