-- CreateEnum
CREATE TYPE "MindmapKnowledgeSourceType" AS ENUM ('DOCUMENT', 'NODE');

-- CreateTable
CREATE TABLE "mindmap_source_documents" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "uploadedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mindmap_source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mindmap_knowledge_chunks" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "sourceType" "MindmapKnowledgeSourceType" NOT NULL,
    "sourceDocumentId" TEXT,
    "nodeId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mindmap_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mindmap_source_documents_mindmapId_idx" ON "mindmap_source_documents"("mindmapId");

-- CreateIndex
CREATE INDEX "mindmap_knowledge_chunks_mindmapId_idx" ON "mindmap_knowledge_chunks"("mindmapId");

-- CreateIndex
CREATE INDEX "mindmap_knowledge_chunks_mindmapId_sourceType_idx" ON "mindmap_knowledge_chunks"("mindmapId", "sourceType");

-- AddForeignKey
ALTER TABLE "mindmap_source_documents" ADD CONSTRAINT "mindmap_source_documents_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindmap_knowledge_chunks" ADD CONSTRAINT "mindmap_knowledge_chunks_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindmap_knowledge_chunks" ADD CONSTRAINT "mindmap_knowledge_chunks_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "mindmap_source_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddSearchVector
-- Hand-written (Prisma's Unsupported() type has no migration support): a
-- generated column kept in sync automatically on every insert/update, so
-- application code never writes it directly. 'simple' config (tokenize
-- only, no English stemming) since chunk content may be Vietnamese or
-- mixed-language, where English stemming would mis-rank matches silently.
ALTER TABLE "mindmap_knowledge_chunks"
    ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED;

-- CreateIndex
CREATE INDEX "mindmap_knowledge_chunks_search_idx" ON "mindmap_knowledge_chunks" USING GIN ("searchVector");
