-- Personal sidebar visibility is separate from mindmap access.
CREATE TABLE "mindmap_sidebar_hides" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mindmap_sidebar_hides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mindmap_sidebar_hides_mindmapId_userEmail_key"
ON "mindmap_sidebar_hides"("mindmapId", "userEmail");

CREATE INDEX "mindmap_sidebar_hides_userEmail_hiddenAt_idx"
ON "mindmap_sidebar_hides"("userEmail", "hiddenAt");

ALTER TABLE "mindmap_sidebar_hides"
ADD CONSTRAINT "mindmap_sidebar_hides_mindmapId_fkey"
FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "MindmapNotificationType" ADD VALUE 'SHARE_LEFT';
