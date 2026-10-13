import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  authenticateWorkspaceAgentRequest,
  hasWorkspaceAgentUserToken,
} from "@/lib/workspace/agentAuth";

/**
 * Same session-resolution logic as app/api/mindmaps/_auth.ts, duplicated
 * rather than imported — app/workspace/** and its API must stay independent
 * of the mindmap feature (see app/workspace/CONTRACTS.md), and that
 * independence extends to not coupling this route family to a mindmap-owned
 * module even though the underlying auth mechanism is identical.
 *
 * The resolved address is always lower-cased and trimmed. Email IS the
 * identity here (no users table), and every row this API writes keys off this
 * value, so normalizing once at the entry point is what stops the same person
 * being stored as two identities. See lib/workspace/identity.ts.
 */
const canonical = (email: string) => email.trim().toLowerCase();

export async function resolveWorkspaceCallerEmail(req: NextRequest): Promise<string | null> {
  if (process.env.NODE_ENV !== "production") {
    const mockEmailCookie = req.cookies.get("mock-email")?.value;
    if (mockEmailCookie?.trim()) return canonical(mockEmailCookie);
  }

  const token = await getToken({ req });
  if (typeof token?.email === "string" && token.email.trim()) {
    return canonical(token.email);
  }

  if (process.env.NODE_ENV !== "production") {
    return canonical(
      process.env.WORKSPACE_DEV_USER_EMAIL
        ?? "user@example.com",
    );
  }

  return null;
}

export type WorkspaceCallerAuthFailure = {
  ok: false;
  status: 401 | 500;
  code: string;
  message: string;
};

export type WorkspaceCallerAuthResult =
  | { ok: true; email: string }
  | WorkspaceCallerAuthFailure;

/**
 * Resolves the caller's email for a Workspace route that must accept BOTH a
 * browser tab (NextAuth cookie, via resolveWorkspaceCallerEmail above) and
 * the Dify Workspace Agent (service key + signed X-Workspace-User-Token, via
 * lib/workspace/agentAuth.ts) — currently GET /api/workspaces/[id] and
 * POST /api/workspaces/[id]/agent, the two calls the Workspace Agent Dify
 * workflow makes.
 *
 * Dispatch is by presence of the agent user token, not by trying one and
 * falling back to the other: a browser never sends X-Workspace-User-Token
 * (or its query/body fallback), so seeing one at all means this is the agent
 * path, and a request that carries a bad token or a bad service key fails
 * closed with 401 rather than being retried against the cookie.
 *
 * Either path returns only an email. Board-level permission is not decided
 * here — the caller still runs resolveAccessRole(board, email) afterwards,
 * and "no access" still reports as 404, same as it always has, for both a
 * browser caller and an authenticated-but-unauthorized agent caller.
 */
export async function resolveWorkspaceCallerAuth(
  req: NextRequest,
  body?: unknown,
): Promise<WorkspaceCallerAuthResult> {
  if (hasWorkspaceAgentUserToken(req, body)) {
    const agentAuth = await authenticateWorkspaceAgentRequest(req, body);
    if (agentAuth.ok === false) {
      // Keep the diagnostic useful for local Dify wiring without ever logging
      // either credential or the signed user token.
      console.warn("[workspace-agent-auth] rejected", { method: req.method, code: agentAuth.code });
    }
    return agentAuth;
  }

  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Unauthorized" };
  }
  return { ok: true, email };
}
