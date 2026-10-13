-- Checkpoint 5 of workspace-resource-roadmap.md: schema-only groundwork for
-- keeping an uploaded file's original bytes and version history, and for a
-- future file-reference block to point at one. Nothing in the app writes
-- these tables yet — the upload route still discards original bytes after
-- extraction (app/api/workspaces/[id]/documents/route.ts). A later checkpoint
-- wires storage + repository code together once the object-storage ACL and
-- repository contract are verified.

DO $$
BEGIN
    CREATE TYPE "WorkspaceResourceKind" AS ENUM ('DOCUMENT', 'IMAGE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "workspace_resources" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "kind" "WorkspaceResourceKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceDocumentId" TEXT,

    CONSTRAINT "workspace_resources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "workspace_file_versions" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_file_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "workspace_resource_references" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "versionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_resource_references_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_resources_sourceDocumentId_key"
    ON "workspace_resources" ("sourceDocumentId");

CREATE INDEX IF NOT EXISTS "workspace_resources_boardId_createdAt_idx"
    ON "workspace_resources" ("boardId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_file_versions_resourceId_versionNumber_key"
    ON "workspace_file_versions" ("resourceId", "versionNumber");

CREATE INDEX IF NOT EXISTS "workspace_resource_references_boardId_blockId_idx"
    ON "workspace_resource_references" ("boardId", "blockId");
CREATE INDEX IF NOT EXISTS "workspace_resource_references_resourceId_idx"
    ON "workspace_resource_references" ("resourceId");

DO $$
BEGIN
    ALTER TABLE "workspace_resources"
        ADD CONSTRAINT "workspace_resources_boardId_fkey"
        FOREIGN KEY ("boardId") REFERENCES "workspace_boards" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Forward-compat seam only: null until a later checkpoint starts linking an
-- upload's original-bytes row to its extracted-text row. Deleting the
-- extracted-text row must not take the resource (or its versions) with it.
DO $$
BEGIN
    ALTER TABLE "workspace_resources"
        ADD CONSTRAINT "workspace_resources_sourceDocumentId_fkey"
        FOREIGN KEY ("sourceDocumentId") REFERENCES "workspace_source_documents" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_file_versions"
        ADD CONSTRAINT "workspace_file_versions_resourceId_fkey"
        FOREIGN KEY ("resourceId") REFERENCES "workspace_resources" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_resource_references"
        ADD CONSTRAINT "workspace_resource_references_boardId_fkey"
        FOREIGN KEY ("boardId") REFERENCES "workspace_boards" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_resource_references"
        ADD CONSTRAINT "workspace_resource_references_resourceId_fkey"
        FOREIGN KEY ("resourceId") REFERENCES "workspace_resources" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A pinned reference follows its version; deleting just that version drops
-- the pin back to "follow latest" rather than deleting the reference itself.
DO $$
BEGIN
    ALTER TABLE "workspace_resource_references"
        ADD CONSTRAINT "workspace_resource_references_versionId_fkey"
        FOREIGN KEY ("versionId") REFERENCES "workspace_file_versions" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Both createdByEmail columns are identity columns, so they follow the
-- invariant established in 20260904100000: stored lower-cased and enforced.
-- No data-normalize UPDATE first — these are brand-new, still-empty tables.
DO $$
BEGIN
    ALTER TABLE "workspace_resources"
        ADD CONSTRAINT "workspace_resources_createdByEmail_lower"
        CHECK ("createdByEmail" = lower("createdByEmail"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_file_versions"
        ADD CONSTRAINT "workspace_file_versions_createdByEmail_lower"
        CHECK ("createdByEmail" = lower("createdByEmail"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
