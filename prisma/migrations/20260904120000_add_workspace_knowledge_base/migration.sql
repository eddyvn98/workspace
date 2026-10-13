-- Per-board document knowledge base: one row per uploaded file plus the
-- searchable slices cut from it, mirroring 20260807064826 on the mindmap side.
--
-- The work that looks expensive is already done and is NOT re-implemented
-- here: lib/extract-knowledge.ts turns PDF/Word/Excel into text and is shared
-- verbatim with the mindmap and project routes, lib/dify-caption.ts captions
-- images so they become searchable too, and lib/embeddings.ts produces the
-- vectors in-process. This migration only gives the workspace engine its own
-- tables to put the results in.

DO $$
BEGIN
    CREATE TYPE "WorkspaceKnowledgeSourceType" AS ENUM ('DOCUMENT', 'BLOCK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "workspace_source_documents" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "uploadedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_source_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "workspace_knowledge_chunks" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "sourceType" "WorkspaceKnowledgeSourceType" NOT NULL,
    "sourceDocumentId" TEXT,
    "blockId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],

    CONSTRAINT "workspace_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- Follows the list route's actual query (one board, newest first) rather than
-- copying legacy's mindmapId-only index, which leaves its own ordering
-- unsupported — the same correction made for the notification bell in
-- 20260904110000.
CREATE INDEX IF NOT EXISTS "workspace_source_documents_boardId_createdAt_idx"
    ON "workspace_source_documents" ("boardId", "createdAt");

CREATE INDEX IF NOT EXISTS "workspace_knowledge_chunks_boardId_idx"
    ON "workspace_knowledge_chunks" ("boardId");
CREATE INDEX IF NOT EXISTS "workspace_knowledge_chunks_boardId_sourceType_idx"
    ON "workspace_knowledge_chunks" ("boardId", "sourceType");

DO $$
BEGIN
    ALTER TABLE "workspace_source_documents"
        ADD CONSTRAINT "workspace_source_documents_boardId_fkey"
        FOREIGN KEY ("boardId") REFERENCES "workspace_boards" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "workspace_knowledge_chunks"
        ADD CONSTRAINT "workspace_knowledge_chunks_boardId_fkey"
        FOREIGN KEY ("boardId") REFERENCES "workspace_boards" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Deleting a document takes its chunks with it, so nothing keeps answering
-- searches out of a file the owner removed.
DO $$
BEGIN
    ALTER TABLE "workspace_knowledge_chunks"
        ADD CONSTRAINT "workspace_knowledge_chunks_sourceDocumentId_fkey"
        FOREIGN KEY ("sourceDocumentId") REFERENCES "workspace_source_documents" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Hand-written because Prisma's Unsupported() type cannot be migrated: a
-- generated column Postgres keeps in sync on every insert and update, so
-- application code never writes it. 'simple' config (tokenize only, no
-- English stemming) because content here may be Vietnamese or mixed-language,
-- where English stemming would mis-rank matches with no error to notice.
DO $$
BEGIN
    ALTER TABLE "workspace_knowledge_chunks"
        ADD COLUMN "searchVector" tsvector
        GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "workspace_knowledge_chunks_search_idx"
    ON "workspace_knowledge_chunks" USING GIN ("searchVector");

-- The uploader is an identity column, so it follows the invariant established
-- in 20260904100000: stored lower-cased, and enforced rather than hoped for.
UPDATE "workspace_source_documents"
    SET "uploadedByEmail" = lower("uploadedByEmail")
    WHERE "uploadedByEmail" <> lower("uploadedByEmail");

DO $$
BEGIN
    ALTER TABLE "workspace_source_documents"
        ADD CONSTRAINT "workspace_source_documents_uploadedByEmail_lower"
        CHECK ("uploadedByEmail" = lower("uploadedByEmail"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
