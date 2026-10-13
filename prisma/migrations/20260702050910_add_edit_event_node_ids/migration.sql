-- AlterTable
ALTER TABLE "mindmap_edit_events" ADD COLUMN     "nodeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
