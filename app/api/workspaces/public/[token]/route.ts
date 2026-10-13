/**
 * app/api/workspaces/public/[token]/route.ts
 *
 * Anonymous, no-login read-only access to a workspace board.
 * This route never calls resolveWorkspaceCallerEmail — the token itself
 * is the credential. Read-only by construction (GET only).
 */

import { NextRequest, NextResponse } from "next/server";
import { ensurePublicWorkspaceBoard, publicWorkspaceBoardPayload } from "@/lib/workspace/public-board";

type RouteParams = { params: { token: string } };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token } = params;
  if (!token) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const board = await ensurePublicWorkspaceBoard(token);
    if (!board) {
      return NextResponse.json(
        { error: "This share link is invalid or has expired" },
        { status: 404 }
      );
    }

    return NextResponse.json(publicWorkspaceBoardPayload(board));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
