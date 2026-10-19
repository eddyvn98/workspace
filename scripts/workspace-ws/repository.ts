import type { StoredDocumentBoard } from "../../lib/workspace/document-room";
import type { WorkspaceWsConfig } from "./config";

export class RepositoryError extends Error {
  constructor(public status: number, public reason: string) { super(`Workspace repository ${status}: ${reason}`); }
  get terminal(): boolean { return [401, 403, 404, 413].includes(this.status) || this.reason === "collection_requires_rest"; }
}
export interface WorkspaceRepository {
  load: (boardId: string) => Promise<StoredDocumentBoard>;
  save: (boardId: string, board: StoredDocumentBoard, baseRevision: number, actorEmail: string) => Promise<number>;
}
export async function readBoundedJson(response: Response, maxBytes: number): Promise<Record<string, unknown>> {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new RepositoryError(413, "payload_too_large");
  const reader = response.body?.getReader();
  if (!reader) throw new RepositoryError(502, "empty_response");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new RepositoryError(413, "payload_too_large"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RepositoryError(502, "invalid_response");
  return value as Record<string, unknown>;
}
const record = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value);
export function createRepository(config: WorkspaceWsConfig): WorkspaceRepository {
  const request = async (boardId: string, body?: string) => {
    const response = await fetch(new URL(`/api/workspaces/${encodeURIComponent(boardId)}/sync-board`, config.apiOrigin), {
      method: body === undefined ? "GET" : "POST", body,
      headers: { authorization: `Bearer ${config.secret}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    const value = await readBoundedJson(response, config.maxHttpBytes);
    if (!response.ok) throw new RepositoryError(response.status, typeof value.reason === "string" ? value.reason : "request_failed");
    return value;
  };
  return {
    async load(boardId) {
      const value = await request(boardId);
      if (typeof value.title !== "string" || !record(value.blocks) || !record(value.connectors)
        || !Array.isArray(value.blockOrder) || !value.blockOrder.every((id) => typeof id === "string")
        || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
        || (value.documentState != null && (typeof value.documentState !== "string"
          || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.documentState)
          || Buffer.byteLength(value.documentState, "base64") > config.maxCheckpointBytes))) {
        throw new RepositoryError(502, "invalid_board");
      }
      return value as unknown as StoredDocumentBoard;
    },
    async save(boardId, board, baseRevision, actorEmail) {
      const body = JSON.stringify({ ...board, baseRevision, actorEmail });
      if (Buffer.byteLength(body) > config.maxHttpBytes) throw new RepositoryError(413, "payload_too_large");
      const value = await request(boardId, body);
      if (value.ok !== true || !Number.isSafeInteger(value.revision) || Number(value.revision) <= baseRevision) {
        throw new RepositoryError(502, "invalid_receipt");
      }
      return Number(value.revision);
    },
  };
}
