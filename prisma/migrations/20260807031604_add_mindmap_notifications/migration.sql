-- CreateEnum
CREATE TYPE "MindmapNotificationType" AS ENUM ('MENTION', 'REPLY', 'NEW_COMMENT');

-- CreateTable
CREATE TABLE "mindmap_notifications" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "type" "MindmapNotificationType" NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "bodyPreview" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mindmap_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mindmap_notifications_recipientEmail_read_createdAt_idx" ON "mindmap_notifications"("recipientEmail", "read", "createdAt");

-- AddForeignKey
ALTER TABLE "mindmap_notifications" ADD CONSTRAINT "mindmap_notifications_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
