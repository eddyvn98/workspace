-- AlterTable
ALTER TABLE "mindmap_nodes" ADD COLUMN     "descriptionStyle" JSONB,
ADD COLUMN     "floating" BOOLEAN DEFAULT false,
ADD COLUMN     "height" DOUBLE PRECISION,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "width" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "mindmaps" ADD COLUMN     "connectionStyle" TEXT,
ADD COLUMN     "freeLayout" BOOLEAN,
ADD COLUMN     "layoutType" TEXT,
ADD COLUMN     "nodeShape" TEXT,
ADD COLUMN     "stylePreset" JSONB;
