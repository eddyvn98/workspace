-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MindmapShareRole" AS ENUM ('VIEWER', 'EDITOR');

-- CreateTable
CREATE TABLE "mindmaps" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mindmaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mindmap_nodes" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "topic" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "expanded" BOOLEAN NOT NULL DEFAULT true,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "style" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mindmap_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mindmap_relationships" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mindmap_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mindmap_shares" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "role" "MindmapShareRole" NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mindmap_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mindmap_edit_events" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "opType" TEXT NOT NULL,
    "payload" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mindmap_edit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mindmap_snapshots" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "treeJson" JSONB NOT NULL,
    "label" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mindmap_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mindmaps_ownerEmail_idx" ON "mindmaps"("ownerEmail");

-- CreateIndex
CREATE INDEX "mindmap_nodes_mindmapId_idx" ON "mindmap_nodes"("mindmapId");

-- CreateIndex
CREATE INDEX "mindmap_nodes_mindmapId_parentId_idx" ON "mindmap_nodes"("mindmapId", "parentId");

-- CreateIndex
CREATE INDEX "mindmap_relationships_mindmapId_idx" ON "mindmap_relationships"("mindmapId");

-- CreateIndex
CREATE INDEX "mindmap_shares_invitedEmail_idx" ON "mindmap_shares"("invitedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "mindmap_shares_mindmapId_invitedEmail_key" ON "mindmap_shares"("mindmapId", "invitedEmail");

-- CreateIndex
CREATE INDEX "mindmap_edit_events_mindmapId_createdAt_idx" ON "mindmap_edit_events"("mindmapId", "createdAt");

-- CreateIndex
CREATE INDEX "mindmap_edit_events_mindmapId_actorEmail_idx" ON "mindmap_edit_events"("mindmapId", "actorEmail");

-- CreateIndex
CREATE INDEX "mindmap_snapshots_mindmapId_createdAt_idx" ON "mindmap_snapshots"("mindmapId", "createdAt");

-- AddForeignKey
ALTER TABLE "mindmap_nodes" ADD CONSTRAINT "mindmap_nodes_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindmap_relationships" ADD CONSTRAINT "mindmap_relationships_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindmap_shares" ADD CONSTRAINT "mindmap_shares_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindmap_edit_events" ADD CONSTRAINT "mindmap_edit_events_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mindmap_snapshots" ADD CONSTRAINT "mindmap_snapshots_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "mindmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

