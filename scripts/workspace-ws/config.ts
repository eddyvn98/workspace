import { timingSafeEqual } from "node:crypto";
import { jwtVerify } from "jose";

export interface WorkspaceWsConfig {
  host: string; port: number; secret: string; apiOrigin: string;
  flushIdleMs: number; flushDeadlineMs: number; requestTimeoutMs: number;
  maxHttpBytes: number; maxMessageBytes: number; maxCheckpointBytes: number;
  maxRooms: number; maxClientsPerRoom: number; idleRoomMs: number;
}
export interface PeerIdentity { boardId: string; userEmail: string; role: "owner" | "EDITOR" | "VIEWER"; issuedAt?: number }
const mb = 1024 * 1024;
export const validBoardId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,128}$/.test(value);
export function readConfig(env: NodeJS.ProcessEnv = process.env): WorkspaceWsConfig {
  if (!env.WORKSPACE_WS_TOKEN_SECRET) throw new Error("WORKSPACE_WS_TOKEN_SECRET is required");
  const port = Number(env.WORKSPACE_WS_PORT ?? 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid WORKSPACE_WS_PORT");
  const origin = new URL(env.WORKSPACE_INTERNAL_API_ORIGIN || "http://127.0.0.1:3000");
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) throw new Error("Invalid WORKSPACE_INTERNAL_API_ORIGIN");
  return { host: env.WORKSPACE_WS_HOST || "0.0.0.0", port, secret: env.WORKSPACE_WS_TOKEN_SECRET,
    apiOrigin: origin.origin, flushIdleMs: 2000, flushDeadlineMs: 10_000, requestTimeoutMs: 10_000,
    maxHttpBytes: 32 * mb, maxMessageBytes: 8 * mb, maxCheckpointBytes: 24 * mb,
    maxRooms: 100, maxClientsPerRoom: 64, idleRoomMs: 30_000 };
}
export function isInternalAuthorized(header: string | undefined, secret: string): boolean {
  if (!secret || !header) return false;
  const actual = Buffer.from(header), expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function authenticatePeer(token: string | null, boardId: string, secret: string): Promise<PeerIdentity> {
  if (!secret || !validBoardId(boardId) || !token || token.length > 4096) throw new Error("Invalid credentials");
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ["HS256"], requiredClaims: ["iat", "exp", "boardId", "userEmail", "role"], maxTokenAge: "65s", clockTolerance: 2,
  });
  if (payload.boardId !== boardId || typeof payload.userEmail !== "string" || !payload.userEmail.trim()
    || payload.userEmail.length > 320 || !["owner", "EDITOR", "VIEWER"].includes(String(payload.role))
    || typeof payload.exp !== "number" || typeof payload.iat !== "number" || payload.exp - payload.iat > 65) {
    throw new Error("Invalid credentials");
  }
  return { boardId, userEmail: payload.userEmail.trim().toLowerCase(), role: payload.role as PeerIdentity["role"], issuedAt: payload.iat };
}
