CREATE TABLE "workspace_realtime_outbox" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "patch" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_realtime_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_realtime_outbox_boardId_revision_key"
ON "workspace_realtime_outbox"("boardId", "revision");

CREATE INDEX "workspace_realtime_outbox_delivery_idx"
ON "workspace_realtime_outbox"("deliveredAt", "availableAt", "leaseUntil", "createdAt");

ALTER TABLE "workspace_realtime_outbox"
ADD CONSTRAINT "workspace_realtime_outbox_boardId_fkey"
FOREIGN KEY ("boardId") REFERENCES "workspace_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
