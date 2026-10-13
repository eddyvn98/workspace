import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CommandReceiptKey = {
  boardId: string;
  actorEmail: string;
  requestId: string;
  payloadHash: string;
};

export function commandReceiptKey(boardId: string, actorEmail: string, body: Record<string, unknown>): CommandReceiptKey | null {
  if (body.requestId === undefined) return null;
  if (typeof body.requestId !== "string" || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(body.requestId)) {
    throw new Error("requestId must contain 1–160 letters, digits, dots, colons, underscores or hyphens");
  }
  const { requestId, workspace_user_token: _token, ...command } = body;
  const canonical = JSON.stringify(command, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    : value);
  return { boardId, actorEmail, requestId, payloadHash: createHash("sha256").update(canonical).digest("hex") };
}

export async function readCommandReceipt(key: CommandReceiptKey): Promise<
  | { kind: "missing" }
  | { kind: "conflict" }
  | { kind: "replay"; response: Record<string, unknown> }
> {
  const rows = await prisma.$queryRaw<Array<{ payload_hash: string; response: Record<string, unknown> }>>`
    SELECT payload_hash, response FROM workspace_command_receipts
    WHERE board_id = ${key.boardId} AND actor_email = ${key.actorEmail} AND request_id = ${key.requestId}
  `;
  if (!rows[0]) return { kind: "missing" };
  return rows[0].payload_hash === key.payloadHash
    ? { kind: "replay", response: rows[0].response }
    : { kind: "conflict" };
}

export async function writeCommandReceipt(tx: Prisma.TransactionClient, key: CommandReceiptKey, response: unknown): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO workspace_command_receipts (board_id, actor_email, request_id, payload_hash, response)
    VALUES (${key.boardId}, ${key.actorEmail}, ${key.requestId}, ${key.payloadHash}, ${JSON.stringify(response)}::jsonb)
  `;
}
