-- Derivative previews of a WorkspaceFileVersion (Office docs rendered to PDF
-- so they preview through the same iframe path as a native PDF/image) — see
-- lib/workspace/office-preview-conversion.ts and workspace-resource-roadmap.md.

DO $$
BEGIN
    CREATE TYPE "WorkspaceArtifactKind" AS ENUM ('PDF_PREVIEW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "WorkspaceArtifactStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'UNSUPPORTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "workspace_artifacts" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "kind" "WorkspaceArtifactKind" NOT NULL,
    "status" "WorkspaceArtifactStatus" NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_artifacts_versionId_kind_key"
    ON "workspace_artifacts" ("versionId", "kind");

DO $$
BEGIN
    ALTER TABLE "workspace_artifacts"
        ADD CONSTRAINT "workspace_artifacts_versionId_fkey"
        FOREIGN KEY ("versionId") REFERENCES "workspace_file_versions" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
