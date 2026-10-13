import { normalizeTreeLayoutFields } from "@/app/workspace/utils/normalizeTreeLayoutFields";
import { boardMetadata } from "@/lib/workspace/boardMetadata";
/**
 * POST /api/workspaces/[id]/sync-board — how a live room's content reaches
 * the database.
 *
 * Workspace counterpart of app/api/mindmaps/[mindmapId]/sync-tree/route.ts,
 * and the reason it exists at all: while a room is open the realtime service
 * holds the newest content, and that service has no browser session to write
 * with. So it authenticates as a CALLER with a shared secret and says which
 * person it is acting for — the secret authenticates the service, never the
 * user, and that person's access is still checked here.
 *
 * The write goes through the same commitBoardContent as a person's own save,
 * revision refusal included. A room whose flush is refused as stale is
 * expected to adopt the stored content and try again — it must not retry the
 * same superseded content, which is the overwrite the refusal exists to
 * prevent.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveAccessRole } from "../../_access";
import { asBlockRecord, collectBlockEditEvents, collectConnectorEditEvents } from "../../_edit-events";
import { normalizeWorkspaceEmail } from "@/lib/workspace/identity";
import { commitBoardContent } from "@/lib/workspace/boardCommit";

type RouteParams = { params: { id: string } };

function isServiceAuthorized(req: NextRequest): boolean {
  const secret = process.env.WORKSPACE_WS_TOKEN_SECRET;
  // An unset secret must authorize nobody. Comparing against undefined would
  // make the literal string "Bearer undefined" a valid credential.
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * GET — the content a room is seeded from when it first opens.
 *
 * Deliberately here rather than in the realtime service's own database
 * client: a workspace room never touches Postgres. It reads through this and
 * writes through the POST below, which means the service needs no schema, no
 * migrations, and no second opinion about what a board is — and the app stays
 * the only reader and writer of its own data. Legacy's mindmap rooms do carry
 * their own Prisma client, and every schema change has to be applied in two
 * places as a result.
 *
 * Access is not checked per person here because there is no person yet: the
 * room is being opened, and every socket that joins it presents its own
 * signed role. That makes this endpoint service-only, which is why the
 * secret is the whole gate.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!isServiceAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found", reason: "gone" }, { status: 404 });
  return NextResponse.json({
    title: board.title,
    blocks: board.blocks ?? {},
    blockOrder: board.blockOrder ?? [],
    connectors: board.connectors ?? {},
    camera: board.camera ?? {},
    revision: board.revision,
    ...boardMetadata(board),
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  if (!isServiceAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, blocks, blockOrder, connectors, camera, baseRevision } = body;
  const actorEmail = normalizeWorkspaceEmail(
    typeof body.actorEmail === "string" ? body.actorEmail : null,
  );
  if (!actorEmail) {
    return NextResponse.json({ error: "actorEmail is required" }, { status: 400 });
  }
  if (typeof title !== "string" || !blocks || !blockOrder || !connectors || !camera) {
    return NextResponse.json(
      { error: "title, blocks, blockOrder, connectors, camera required" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(baseRevision) || (baseRevision as number) < 0) {
    // A room that cannot say what it built on cannot be ordered against a
    // concurrent writer, so it is refused rather than allowed to overwrite.
    return NextResponse.json(
      { error: "baseRevision (integer) is required", reason: "no_base" },
      { status: 400 },
    );
  }

  // A live room only ever exists for a board that exists, so absence here
  // means the board was deleted while somebody had it open. Said plainly, so
  // the service can stop trying rather than retry a write with no target.
  const existing = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found", reason: "gone" }, { status: 404 });

  // The secret got the request in; it does not decide whose board this is.
  const role = await resolveAccessRole(existing, actorEmail);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "VIEWER") return NextResponse.json({ error: "Read-only access" }, { status: 403 });

  const editEvents = [
    ...collectBlockEditEvents(
      params.id, asBlockRecord(existing.blocks), asBlockRecord(blocks), actorEmail, undefined,
    ),
    ...collectConnectorEditEvents(
      params.id, asBlockRecord(existing.connectors), asBlockRecord(connectors), actorEmail,
    ),
  ];

  const outcome = await commitBoardContent({
    boardId: params.id,
    actorEmail,
    content: {
      ...normalizeTreeLayoutFields({ ...existing, ...body }),
      frames: (body.frames ?? existing.frames ?? []) as Prisma.InputJsonValue,
      title,
      blocks: blocks as Prisma.InputJsonValue,
      blockOrder: blockOrder as Prisma.InputJsonValue,
      connectors: connectors as Prisma.InputJsonValue,
      camera: camera as Prisma.InputJsonValue,
    },
    editEvents,
    baseRevision: baseRevision as number,
    existing,
  });

  if ("gone" in outcome) {
    return NextResponse.json({ error: "Not found", reason: "gone" }, { status: 404 });
  }
  if ("stale" in outcome) {
    return NextResponse.json(
      { error: "This board changed since the room loaded it", reason: "stale", revision: outcome.revision },
      { status: 409 },
    );
  }
  // The new revision is what the room adopts, so its next flush can be
  // ordered against this one.
  return NextResponse.json({ ok: true, revision: outcome.board.revision });
}
