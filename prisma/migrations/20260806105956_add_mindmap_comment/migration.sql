-- CreateTable
CREATE TABLE "mindmap_comments" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "authorEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mindmap_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mindmap_comments_mindmapId_nodeId_idx" ON "mindmap_comments"("mindmapId", "nodeId");

-- CreateIndex
CREATE INDEX "mindmap_comments_mindmapId_createdAt_idx" ON "mindmap_comments"("mindmapId", "createdAt");

-- AddForeignKey
ALTER TABLE "mindmap_comments" ADD CONSTRAINT "mindmap_comments_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
