import { prisma } from "@/lib/prisma";
import type { WorkspaceTurnProgressEvent, WorkspaceTurnProgressInput } from "./contracts";

export interface WorkspaceTurnKey {
  boardId: string;
  actorEmail: string;
  turnId: string;
}

export async function appendWorkspaceTurnProgress(
  key: WorkspaceTurnKey,
  event: WorkspaceTurnProgressInput,
): Promise<WorkspaceTurnProgressEvent | null> {
  return prisma.$transaction(async (tx) => {
    const turn = await tx.$queryRaw<Array<{ turn_id: string; status: string }>>`
      SELECT turn_id, status FROM workspace_agent_turns
      WHERE board_id = ${key.boardId} AND actor_email = ${key.actorEmail} AND turn_id = ${key.turnId}
      FOR UPDATE
    `;
    if (!turn.length || (turn[0].status !== "running" && event.phase !== "completed")) return null;
    const inserted = await tx.$queryRaw<Array<{ sequence: number }>>`
      INSERT INTO workspace_agent_turn_events (
        board_id, actor_email, turn_id, sequence, phase, round, persisted_count, revision
      )
      SELECT ${key.boardId}, ${key.actorEmail}, ${key.turnId}, COALESCE(MAX(sequence), 0) + 1,
        ${event.phase}, ${event.round ?? null}, ${event.persistedCount ?? null}, ${event.revision ?? null}
      FROM workspace_agent_turn_events
      WHERE board_id = ${key.boardId} AND actor_email = ${key.actorEmail} AND turn_id = ${key.turnId}
      RETURNING sequence
    `;
    if (!inserted[0]) return null;
    await tx.$executeRaw`
      UPDATE workspace_agent_turns SET updated_at = CURRENT_TIMESTAMP
      WHERE board_id = ${key.boardId} AND actor_email = ${key.actorEmail} AND turn_id = ${key.turnId}
        AND status = 'running'
    `;
    return { sequence: inserted[0].sequence, ...event };
  });
}

export async function readWorkspaceTurnProgress(
  key: WorkspaceTurnKey,
  afterSequence = 0,
  expectedPayloadHash?: string,
): Promise<WorkspaceTurnProgressEvent[]> {
  const cursor = Number.isSafeInteger(afterSequence) && afterSequence > 0 ? afterSequence : 0;
  const rows = await prisma.$queryRaw<WorkspaceTurnProgressEvent[]>`
    SELECT event.sequence, event.phase, event.round,
      event.persisted_count AS "persistedCount", event.revision
    FROM workspace_agent_turn_events AS event
    JOIN workspace_agent_turns AS turn
      ON turn.board_id = event.board_id AND turn.actor_email = event.actor_email AND turn.turn_id = event.turn_id
    WHERE event.board_id = ${key.boardId} AND event.actor_email = ${key.actorEmail} AND event.turn_id = ${key.turnId}
      AND event.sequence > ${cursor}
      AND (${expectedPayloadHash ?? null}::text IS NULL OR turn.payload_hash = ${expectedPayloadHash ?? null})
    ORDER BY event.sequence ASC
    LIMIT 100
  `;
  return rows;
}
