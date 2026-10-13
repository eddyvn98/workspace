-- CreateEnum
CREATE TYPE "MindmapChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "mindmap_chat_sessions" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mindmap_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mindmap_chat_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MindmapChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mindmap_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mindmap_chat_sessions_mindmapId_createdByEmail_updatedAt_idx"
    ON "mindmap_chat_sessions"("mindmapId", "createdByEmail", "updatedAt");

-- CreateIndex
CREATE INDEX "mindmap_chat_messages_sessionId_createdAt_idx"
    ON "mindmap_chat_messages"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "mindmap_chat_sessions"
    ADD CONSTRAINT "mindmap_chat_sessions_mindmapId_fkey"
    FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindmap_chat_messages"
    ADD CONSTRAINT "mindmap_chat_messages_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "mindmap_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
