-- AlterTable
ALTER TABLE "mindmap_nodes"
ADD COLUMN "table" JSONB,
ADD COLUMN "tableId" TEXT,
ADD COLUMN "tableCellId" TEXT;
