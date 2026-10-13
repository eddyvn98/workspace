import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WORKSPACE_RUNTIME_DEADLINE_MS, WORKSPACE_RUNTIME_MAX_ACTIONS, WORKSPACE_RUNTIME_MAX_ROUNDS, type WorkspaceJson } from "./contracts";

export type WorkspaceAgentTurnStart =
  | { kind: "started" }
  | { kind: "replay"; response: WorkspaceJson }
  | { kind: "payload_conflict" }
  | { kind: "running" }
  | { kind: "cancelled" }
  | { kind: "missing" };

interface TurnKey {
  boardId: string;
  actorEmail: string;
  turnId: string;
}

export class WorkspaceTurnNotActiveError extends Error {
  constructor() {
    super("Workspace runtime turn is no longer active");
    this.name = "WorkspaceTurnNotActiveError";
  }
}

const STALE_TURN_GRACE_MS = 15_000;

// First phase uses 1..MAX_ROUNDS; later phases retain their distinct numeric IDs.
export function workspaceReceiptRequestRounds(turnId: string): string[] {
  return Array.from({ length: WORKSPACE_RUNTIME_MAX_ROUNDS }, (_, index) => `${turnId}:${index + 1}`).concat(
    Array.from({ length: WORKSPACE_RUNTIME_MAX_ROUNDS * (WORKSPACE_RUNTIME_MAX_ACTIONS - 1) }, (_, index) => {
      const round = Math.floor(index / (WORKSPACE_RUNTIME_MAX_ACTIONS - 1)) + 1;
      const phase = index % (WORKSPACE_RUNTIME_MAX_ACTIONS - 1) + 1;
      return `${turnId}:${round * 100 + phase}`;
    }),
  );
}

function logicalRound(requestId: string): number {
  const suffix = Number(requestId.slice(requestId.lastIndexOf(":") + 1));
  return suffix >= 100 ? Math.floor(suffix / 100) : suffix;
}

type StoredCommandReceipt = {
  request_id: string;
  response: WorkspaceJson;
};

function recoverInterruptedResponse(key: TurnKey, receipts: StoredCommandReceipt[]): WorkspaceJson {
  const runtimeReceipts = receipts.flatMap(({ request_id, response }) => {
    const round = logicalRound(request_id);
    if (!Array.isArray(response.actions)) return [];
    return response.actions.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const action = value as Record<string, unknown>;
      if (action.changed !== true || typeof action.type !== "string") return [];
      const summary = typeof action.summary === "string" && action.summary.trim()
        ? `${action.type}: ${action.summary.trim().slice(0, 240)}`
        : `${action.type} was saved before the turn stopped unexpectedly (round ${round}).`;
      return [{
        requestId: request_id,
        actionType: action.type,
        targetIds: Array.isArray(action.ids) ? action.ids.filter((id): id is string => typeof id === "string") : [],
        persisted: true,
        revisionBefore: Number.isInteger(response.revisionBefore) ? Number(response.revisionBefore) : 0,
        revisionAfter: Number.isInteger(response.revision) ? Number(response.revision) : null,
        summary,
      }];
    });
  });
  const appliedSummaries = runtimeReceipts.map((receipt) => receipt.summary as string);
  const answerText = runtimeReceipts.length
    ? `The previous attempt stopped unexpectedly. ${runtimeReceipts.length} saved action(s) were recovered from Workspace receipts. Review the board before continuing.`
    : "The previous attempt stopped before a save could be confirmed. Review the board before starting a new request.";
  const unresolvedSummaries = ["The turn was interrupted; no unfinished actions were replayed."];
  return {
    answer: JSON.stringify({ answer: answerText, focusBlockIds: [], appliedSummaries, unresolvedSummaries }),
    turnId: key.turnId,
    conversationId: null,
    rounds: receipts.reduce((max, receipt) => Math.max(max, logicalRound(receipt.request_id) || 0), 0),
    status: "partial",
    receipts: runtimeReceipts,
    appliedSummaries,
    unresolvedSummaries,
    focusBlockIds: [],
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
}

export function workspaceAgentTurnPayloadHash(payload: { query: string; modelSelector: string; context?: string }): string {
  return createHash("sha256").update(JSON.stringify(canonical({
    query: payload.query,
    modelSelector: payload.modelSelector,
    context: payload.context ?? "",
  }))).digest("hex");
}

export async function lockActiveWorkspaceTurn(
  tx: Prisma.TransactionClient,
  key: TurnKey,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ status: string; cancel_requested: boolean }>>`
    SELECT status, cancel_requested FROM workspace_agent_turns
    WHERE board_id = ${key.boardId} AND actor_email = ${key.actorEmail} AND turn_id = ${key.turnId}
    FOR UPDATE
  `;
  return rows[0]?.status === "running" && rows[0].cancel_requested === false;
}

export async function beginWorkspaceTurn(
  key: TurnKey,
  payload: { query: string; modelSelector: string; context?: string },
): Promise<WorkspaceAgentTurnStart> {
  const payloadHash = workspaceAgentTurnPayloadHash(payload);
  const inserted = await prisma.$queryRaw<Array<{ turn_id: string }>>`
    INSERT INTO workspace_agent_turns (board_id, actor_email, turn_id, payload_hash, status, cancel_requested)
    VALUES (${key.boardId}, ${key.actorEmail}, ${key.turnId}, ${payloadHash}, 'running', FALSE)
    ON CONFLICT (board_id, actor_email, turn_id) DO NOTHING
    RETURNING turn_id
  `;
  if (inserted.length) return { kind: "started" };

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ payload_hash: string; status: string; response: WorkspaceJson | null; cancel_requested: boolean; updated_at: Date }>>`
      SELECT payload_hash, status, response, cancel_requested, updated_at
      FROM workspace_agent_turns
      WHERE board_id = ${key.boardId} AND actor_email = ${key.actorEmail} AND turn_id = ${key.turnId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return { kind: "missing" };
    if (row.status === "completed") {
      if (row.payload_hash !== payloadHash) return { kind: "payload_conflict" };
      return row.response ? { kind: "replay", response: row.response } : { kind: "running" };
    }
    if (row.cancel_requested) return { kind: "cancelled" };
    if (row.payload_hash !== payloadHash) return { kind: "payload_conflict" };
    const staleAfterMs = WORKSPACE_RUNTIME_DEADLINE_MS + STALE_TURN_GRACE_MS;
    if (Date.now() - row.updated_at.getTime() <= staleAfterMs) return { kind: "running" };

    const requestIds = workspaceReceiptRequestRounds(key.turnId);
    const savedReceipts = await tx.$queryRaw<StoredCommandReceipt[]>`
      SELECT request_id, response FROM workspace_command_receipts
      WHERE board_id = ${key.boardId} AND actor_email = ${key.actorEmail}
        AND request_id IN (${Prisma.join(requestIds)})
      ORDER BY request_id ASC
    `;
    const response = recoverInterruptedResponse(key, savedReceipts);
    await tx.$executeRaw`
      UPDATE workspace_agent_turns
      SET status = 'completed', response = ${JSON.stringify(response)}::jsonb, updated_at = CURRENT_TIMESTAMP
      WHERE board_id = ${key.boardId} AND actor_email = ${key.actorEmail} AND turn_id = ${key.turnId} AND status = 'running'
    `;
    return { kind: "replay", response };
  });
}

export async function completeWorkspaceTurn(key: TurnKey, response: WorkspaceJson): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE workspace_agent_turns
    SET status = 'completed', response = ${JSON.stringify(response)}::jsonb, updated_at = CURRENT_TIMESTAMP
    WHERE board_id = ${key.boardId} AND actor_email = ${key.actorEmail} AND turn_id = ${key.turnId} AND status = 'running'
  `;
  return updated === 1;
}

export async function cancelWorkspaceTurn(key: TurnKey): Promise<"requested" | "completed" | "missing"> {
  const updated = await prisma.$queryRaw<Array<{ status: string }>>`
    INSERT INTO workspace_agent_turns (board_id, actor_email, turn_id, payload_hash, status, cancel_requested)
    VALUES (${key.boardId}, ${key.actorEmail}, ${key.turnId}, '', 'running', TRUE)
    ON CONFLICT (board_id, actor_email, turn_id) DO UPDATE
      SET cancel_requested = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_agent_turns.status = 'running'
    RETURNING status
  `;
  if (updated.length) return "requested";
  const rows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM workspace_agent_turns
    WHERE board_id = ${key.boardId} AND actor_email = ${key.actorEmail} AND turn_id = ${key.turnId}
  `;
  return rows[0]?.status === "completed" ? "completed" : "missing";
}

export async function isWorkspaceTurnCancelled(key: TurnKey): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ status: string; cancel_requested: boolean }>>`
    SELECT status, cancel_requested FROM workspace_agent_turns
    WHERE board_id = ${key.boardId} AND actor_email = ${key.actorEmail} AND turn_id = ${key.turnId}
  `;
  return !rows[0] || rows[0].status !== "running" || rows[0].cancel_requested === true;
}
