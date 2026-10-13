-- AlterTable
ALTER TABLE "mindmaps" ADD COLUMN "publicViewEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "publicViewToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "mindmaps_publicViewToken_key" ON "mindmaps"("publicViewToken");
