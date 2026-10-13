/**
 * Signer for the short-lived connect token a browser presents when it opens a
 * live session on a board.
 *
 * Signed with WORKSPACE_WS_TOKEN_SECRET — deliberately NOT NEXTAUTH_SECRET,
 * and deliberately not the mindmap channel's secret either. The rule carried
 * over from legacy is that a leak stays scoped to the one channel it was
 * leaked from: this token cannot be turned into a NextAuth session, and it
 * cannot be used to join a mindmap room.
 *
 * Sixty seconds, because it is only ever used to open a socket. A long-lived
 * token would keep granting the role it was signed with after a share was
 * revoked; a short one has to be re-minted on every reconnect, which is what
 * makes an access change actually take effect.
 *
 * Payload shape MUST match the verifier in
 * docker/mindmap-ws/src/workspace-auth.js exactly.
 */

import { SignJWT } from "jose";

export const WORKSPACE_WS_TOKEN_TTL_SECONDS = 60;

export type WorkspaceWsRole = "owner" | "EDITOR" | "VIEWER";

export function getWorkspaceWsSigningSecret(): Uint8Array {
  const secret = process.env.WORKSPACE_WS_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      "WORKSPACE_WS_TOKEN_SECRET is not configured. Set it in .env before using realtime workspace collaboration.",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Mints a connect token for `userEmail` scoped to `boardId` with `role`. */
export async function signWorkspaceWsToken(params: {
  boardId: string;
  userEmail: string;
  role: WorkspaceWsRole;
}): Promise<string> {
  const { boardId, userEmail, role } = params;
  return new SignJWT({ boardId, userEmail, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${WORKSPACE_WS_TOKEN_TTL_SECONDS}s`)
    .sign(getWorkspaceWsSigningSecret());
}
