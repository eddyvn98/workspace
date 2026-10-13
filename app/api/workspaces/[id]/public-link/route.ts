/**
 * app/api/workspaces/[id]/public-link/route.ts
 *
 * Owner-only toggle for the anonymous, no-login read-only share link for a workspace board.
 * The link itself is served by app/api/workspaces/public/[token]/route.ts without authentication.
 * This route only manages the token lifecycle (mint / update expiry / revoke).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../../_auth";
import { requireOwnedBoard } from "../../_access";
import {
  parsePublicLinkExpiration,
  publicLinkExpiresAt,
  mintPublicShareToken,
  type PublicLinkExpiration,
} from "@/lib/workspace/public-link";

type RouteParams = { params: { id: string } };

function toApiResult(result: {
  enabled: boolean;
  token: string | null;
  expiresAt: Date | null;
}) {
  return {
    enabled: result.enabled,
    url: result.token ? `/workspace/view/${result.token}` : null,
    expiresAt: result.expiresAt?.toISOString() ?? null,
  };
}

async function readExpiration(req: NextRequest): Promise<PublicLinkExpiration | null> {
  const body = await req.json().catch(() => ({}));
  return body && typeof body === "object"
    ? parsePublicLinkExpiration((body as { expiration?: unknown }).expiration)
    : null;
}

/** GET /api/workspaces/[id]/public-link — current state of public link (owner-only). */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await requireOwnedBoard(params.id, email);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(
    toApiResult({
      enabled: board.publicShareEnabled,
      token: board.publicShareToken,
      expiresAt: board.publicShareExpiresAt,
    })
  );
}

/** POST /api/workspaces/[id]/public-link — enable link and mint token (owner-only). */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await requireOwnedBoard(params.id, email);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const expiration = (await readExpiration(req)) ?? "7d";
  const expiresAt = publicLinkExpiresAt(expiration);
  const token = mintPublicShareToken();

  const updated = await prisma.workspaceBoard.update({
    where: { id: params.id },
    data: {
      publicShareEnabled: true,
      publicShareToken: token,
      publicShareExpiresAt: expiresAt,
    },
  });

  return NextResponse.json(
    toApiResult({
      enabled: updated.publicShareEnabled,
      token: updated.publicShareToken,
      expiresAt: updated.publicShareExpiresAt,
    })
  );
}

/** PATCH /api/workspaces/[id]/public-link — update expiration without rotating token (owner-only). */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await requireOwnedBoard(params.id, email);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const expiration = await readExpiration(req);
  if (!expiration) {
    return NextResponse.json({ error: "Invalid expiration" }, { status: 400 });
  }

  const expiresAt = board.publicShareEnabled ? publicLinkExpiresAt(expiration) : null;
  const updated = await prisma.workspaceBoard.update({
    where: { id: params.id },
    data: {
      publicShareExpiresAt: expiresAt,
    },
  });

  return NextResponse.json(
    toApiResult({
      enabled: updated.publicShareEnabled,
      token: updated.publicShareToken,
      expiresAt: updated.publicShareExpiresAt,
    })
  );
}

/** DELETE /api/workspaces/[id]/public-link — revoke public link (owner-only). */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await requireOwnedBoard(params.id, email);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.workspaceBoard.update({
    where: { id: params.id },
    data: {
      publicShareEnabled: false,
      publicShareToken: null,
      publicShareExpiresAt: null,
      legacyPublicShareEnabled: false,
      legacyPublicShareToken: null,
      legacyPublicShareExpiresAt: null,
    },
  });

  return NextResponse.json(
    toApiResult({
      enabled: updated.publicShareEnabled,
      token: updated.publicShareToken,
      expiresAt: updated.publicShareExpiresAt,
    })
  );
}
