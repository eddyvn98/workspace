import { hasSpreadsheetBlock } from "@/lib/workspace/spreadsheetGuard";
/**
 * POST /api/workspaces/[id]/ws-token — mints the short-lived token a browser
 * needs to open a live session on this board.
 *
 * Workspace counterpart of app/api/mindmaps/[mindmapId]/ws-token/route.ts.
 *
 * The token carries the role, signed. That is what lets the realtime service
 * refuse a viewer's write without holding any opinion of its own about
 * sharing — but it also means the role is frozen at the moment the socket
 * opened, which is why the token lasts 60 seconds and why an access change
 * closes open sockets rather than waiting for them to notice.
 *
 * A caller with no access gets 404, not 403: the anti-enumeration shape every
 * other workspace route uses, so a stranger cannot learn a board id exists by
 * asking for a token for it.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../../_auth";
import { resolveAccessRole } from "../../_access";
import {
  getWorkspaceWsSigningSecret,
  signWorkspaceWsToken,
  WORKSPACE_WS_TOKEN_TTL_SECONDS,
  type WorkspaceWsRole,
} from "@/lib/workspace/ws-token";

type RouteParams = { params: { id: string } };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await resolveAccessRole(board, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (hasSpreadsheetBlock(board.blocks)) return NextResponse.json({ error: "Spreadsheet boards use revisioned REST saves", reason: "spreadsheet_requires_rest" }, { status: 409 });

  try {
    getWorkspaceWsSigningSecret();
  } catch (err) {
    // Said plainly rather than as a 500 with no explanation: an operator who
    // has not set the secret needs to know that is the reason, and a user
    // needs the app to keep working without a live session.
    console.error("[workspace ws-token]", err);
    return NextResponse.json(
      { error: "Realtime collaboration is not configured on this server" },
      { status: 503 },
    );
  }

  // OWNER is spelled `owner` on the wire, matching the mindmap channel's
  // payload so one verifier can serve both room kinds.
  const wireRole: WorkspaceWsRole = role === "OWNER" ? "owner" : role;
  const token = await signWorkspaceWsToken({ boardId: params.id, userEmail: email, role: wireRole });

  return NextResponse.json({
    token,
    boardId: params.id,
    role: wireRole,
    canWrite: wireRole !== "VIEWER",
    expiresInSeconds: WORKSPACE_WS_TOKEN_TTL_SECONDS,
    // Staging currently builds and deploys the shared collab service URL
    // under the mindmap name. Reuse it unless Workspace has an explicit URL.
    wsUrl: process.env.NEXT_PUBLIC_WORKSPACE_WS_URL
      || process.env.NEXT_PUBLIC_MINDMAP_WS_URL
      || "ws://localhost:1234",
  });
}
