import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerEmail } from "../../_auth";
import { resolveAccessRole } from "../../_access";
import { sameWorkspaceIdentity } from "@/lib/workspace/identity";

/** How long a heartbeat keeps a viewer "active" — a browser tab that closed
 *  without notice self-expires within this window rather than needing an
 *  explicit disconnect signal (see the model comment in schema.prisma). */
const LIVENESS_WINDOW_MS = 15_000;

/** GET /api/workspaces/[id]/presence — every collaborator whose heartbeat
 *  landed within the last 15s, excluding the caller themself. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await resolveAccessRole(board, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const viewers = await prisma.workspacePresence.findMany({
    where: {
      boardId: params.id,
      lastSeenAt: { gte: new Date(Date.now() - LIVENESS_WINDOW_MS) },
    },
    select: { email: true, lastSeenAt: true, selectedBlockId: true, editingBlockId: true },
  });
  return NextResponse.json(viewers.filter((viewer) => !sameWorkspaceIdentity(viewer.email, email)));
}

/** POST /api/workspaces/[id]/presence — heartbeat (any collaborator).
 *  Optional body `{ selectedBlockId, editingBlockId }` records what this
 *  viewer currently has selected/editing; omit or pass null to clear it. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await resolveAccessRole(board, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const selectedBlockId =
    typeof payload.selectedBlockId === "string"
      ? payload.selectedBlockId
      : null;
  const editingBlockId =
    typeof payload.editingBlockId === "string"
      ? payload.editingBlockId
      : null;

  // email is already canonicalized (trimmed+lower-cased) by
  // resolveWorkspaceCallerEmail, and every row this route itself ever writes
  // goes through that same email — so a direct compound-key upsert is a
  // single indexed operation instead of fetching every presence row on the
  // board just to find this caller's own one. Heartbeats fire repeatedly per
  // active viewer, so the old findMany-then-filter scaled as O(viewers) per
  // heartbeat, O(viewers^2) total across a session.
  await prisma.workspacePresence.upsert({
    where: { boardId_email: { boardId: params.id, email } },
    create: { boardId: params.id, email, selectedBlockId, editingBlockId },
    update: { lastSeenAt: new Date(), selectedBlockId, editingBlockId },
  });
  return NextResponse.json({ ok: true });
}
