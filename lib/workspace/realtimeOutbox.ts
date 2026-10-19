import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { postWorkspaceAgentPatch, workspaceRealtimeDeliveryConfigured, type WorkspaceAgentPatch } from "./ws-repository-notify";

const LEASE_SECONDS = 60;
const MAX_RETRY_DELAY_MS = 30_000;

type PendingOutboxEvent = {
  id: string;
  boardId: string;
  revision: number;
  patch: unknown;
  attempts: number;
};

export async function enqueueWorkspaceRealtimePatch(
  tx: Prisma.TransactionClient,
  input: { boardId: string; revision: number; patch: WorkspaceAgentPatch },
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "workspace_realtime_outbox" ("id", "boardId", "revision", "patch")
    VALUES (${randomUUID()}, ${input.boardId}, ${input.revision}, ${JSON.stringify(input.patch)}::jsonb)
  `);
}

export function workspaceOutboxRetryDelayMs(attempt: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** Math.max(0, Math.min(attempt - 1, 5)));
}

async function claimEvents(limit: number, boardId?: string): Promise<PendingOutboxEvent[]> {
  const boardFilter = boardId ? Prisma.sql`AND event."boardId" = ${boardId}` : Prisma.empty;
  return prisma.$transaction((tx) => tx.$queryRaw<PendingOutboxEvent[]>(Prisma.sql`
    WITH picked AS (
      SELECT event."id"
      FROM "workspace_realtime_outbox" AS event
      WHERE event."deliveredAt" IS NULL
        AND event."availableAt" <= NOW()
        AND (event."leaseUntil" IS NULL OR event."leaseUntil" < NOW())
        ${boardFilter}
        AND NOT EXISTS (
          SELECT 1 FROM "workspace_realtime_outbox" AS earlier
          WHERE earlier."boardId" = event."boardId"
            AND earlier."revision" < event."revision"
            AND earlier."deliveredAt" IS NULL
        )
      ORDER BY event."createdAt", event."boardId", event."revision"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "workspace_realtime_outbox" AS event
    SET "leaseUntil" = NOW() + (${LEASE_SECONDS} * INTERVAL '1 second'),
        "attempts" = event."attempts" + 1
    FROM picked
    WHERE event."id" = picked."id"
    RETURNING event."id", event."boardId", event."revision", event."patch", event."attempts"
  `));
}

async function deliverEvent(event: PendingOutboxEvent): Promise<boolean> {
  if (!workspaceRealtimeDeliveryConfigured()) return false;

  try {
    await postWorkspaceAgentPatch(event.boardId, event.patch as unknown as WorkspaceAgentPatch, event.revision);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "workspace_realtime_outbox"
      SET "deliveredAt" = NOW(), "leaseUntil" = NULL, "lastError" = NULL
      WHERE "id" = ${event.id} AND "deliveredAt" IS NULL
    `);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "delivery failed";
    const delay = workspaceOutboxRetryDelayMs(event.attempts);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "workspace_realtime_outbox"
      SET "availableAt" = ${new Date(Date.now() + delay)}, "leaseUntil" = NULL, "lastError" = ${message}
      WHERE "id" = ${event.id} AND "deliveredAt" IS NULL
    `);
    console.warn(`[workspace] realtime outbox delivery failed for ${event.boardId}@${event.revision}: ${message}`);
    return false;
  }
}

/** Delivers oldest pending revisions first per board; duplicate deliveries are safe. */
export async function drainWorkspaceRealtimeOutbox(limit = 20, boardId?: string): Promise<{ claimed: number; delivered: number }> {
  if (!workspaceRealtimeDeliveryConfigured()) {
    return { claimed: 0, delivered: 0 };
  }
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const events = await claimEvents(boundedLimit, boardId);
  let delivered = 0;
  for (const event of events) if (await deliverEvent(event)) delivered++;
  return { claimed: events.length, delivered };
}
