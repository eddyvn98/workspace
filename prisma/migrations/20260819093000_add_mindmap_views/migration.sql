-- Tracks when each person last had a mindmap open, so the sidebar can mark
-- maps that changed since then as having unseen updates.
CREATE TABLE "mindmap_views" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mindmap_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mindmap_views_mindmapId_userEmail_key" ON "mindmap_views"("mindmapId", "userEmail");
CREATE INDEX "mindmap_views_userEmail_idx" ON "mindmap_views"("userEmail");

ALTER TABLE "mindmap_views" ADD CONSTRAINT "mindmap_views_mindmapId_fkey"
    FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
