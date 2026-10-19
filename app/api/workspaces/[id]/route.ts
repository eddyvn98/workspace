import { addDocTextToBlocks, compactAgentRecord } from "./agentReadSummary";
import { NextRequest, NextResponse } from "next/server";
import { withoutDocumentState } from "@/lib/workspace/boardPublicFields";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceCallerAuth, resolveWorkspaceCallerEmail } from "../_auth";
import { hasWorkspaceAgentUserToken } from "@/lib/workspace/agentAuth";
import { requireOwnedBoard, resolveAccessRole } from "../_access";
import {
  asBlockRecord,
  collectBlockEditEvents,
  collectConnectorEditEvents,
} from "../_edit-events";
import { commitBoardContent } from "@/lib/workspace/boardCommit";
import { maybeRunResourceOrphanSweep } from "@/lib/workspace/resource-retention";
import { workspaceRealtimeDeliveryConfigured } from "@/lib/workspace/ws-repository-notify";
import { repositoryBoardPatch } from "@/lib/workspace/repositoryBoardPatch";
import { drainWorkspaceRealtimeOutbox, enqueueWorkspaceRealtimePatch } from "@/lib/workspace/realtimeOutbox";

/** GET /api/workspaces/[id] — board snapshot; agent callers get a compact view by default.
 *  Any collaborator (owner, EDITOR, or VIEWER) can read.
 *
 *  Accepts either a browser session (NextAuth cookie) or the Dify Workspace
 *  Agent (service key + X-Workspace-User-Token) — see resolveWorkspaceCallerAuth
 *  in ../_auth.ts. Both resolve to an email and run through the exact same
 *  resolveAccessRole check below; the agent gets no wider access than the
 *  human it is acting for. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await resolveWorkspaceCallerAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message, code: auth.code }, { status: auth.status });
  }
  const email = auth.email;

  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await resolveAccessRole(board, email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Opportunistic, throttled, fire-and-forget — see resource-retention.ts.
  maybeRunResourceOrphanSweep(params.id, board.blocks);

  const blockCount = Array.isArray(board.blocks)
    ? board.blocks.length
    : board.blocks && typeof board.blocks === "object"
      ? Object.keys(board.blocks).length
      : 0;
  const connectorCount = Array.isArray(board.connectors)
    ? board.connectors.length
    : board.connectors && typeof board.connectors === "object"
      ? Object.keys(board.connectors).length
      : 0;

  // Keep the legacy root snapshot shape for the canvas while also satisfying
  // the Workspace Agent read contract. Duplicating the full board under a
  // nested `board` field would double the response tokens for every read.
  // The agent needs canvas content, not account or public-share credentials.
  // Keep the browser response unchanged because the share controls use those fields.
  const agentRequest = hasWorkspaceAgentUserToken(req);
  const fullAgentRead = agentRequest && req.nextUrl.searchParams.get("view") === "full";
  // ?slideIds=a,b returns complete html/text/notes for just those slides inside the summary view.
  const slideIdsParam = req.nextUrl.searchParams.get("slideIds");
  const fullSlideIds = slideIdsParam ? new Set(slideIdsParam.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 60)) : undefined;
  const boardView = agentRequest
    ? {
      id: board.id,
      title: board.title,
      revision: board.revision,
      blocks: fullAgentRead ? addDocTextToBlocks(board.blocks) : compactAgentRecord(board.blocks, "block", { fullSlideIds }),
      blockOrder: board.blockOrder,
      connectors: fullAgentRead ? board.connectors : compactAgentRecord(board.connectors, "connector"),
      camera: board.camera,
      frames: fullAgentRead ? board.frames ?? [] : (Array.isArray(board.frames) ? board.frames : []).map((frame, index) => {
        const item = frame && typeof frame === "object" ? frame as Record<string, unknown> : {};
        return {
          id: item.id ?? `frame-${index + 1}`,
          name: item.name ?? item.title ?? `Frame ${index + 1}`,
          ...(Array.isArray(item.blockIds) ? { blockIds: item.blockIds } : {}),
          ...(item.hiddenInPresentation === true ? { hiddenInPresentation: true } : {}),
          ...(typeof item.presenterNotes === "string" ? { presenterNotes: item.presenterNotes } : {}),
        };
      }),
      treeLayoutDirection: board.treeLayoutDirection,
      treeGrowthMode: board.treeGrowthMode,
      treeLayoutFamily: board.treeLayoutFamily,
      treeTimelineBranchMode: board.treeTimelineBranchMode,
      treeTimelineDescendantStyle: board.treeTimelineDescendantStyle,
      treeCatalogDescendantStyle: board.treeCatalogDescendantStyle,
      view: fullAgentRead ? "full" : "summary",
    }
    : withoutDocumentState(board);

  return NextResponse.json({
    ...boardView,
    viewerRole: role,
    success: true,
    ok: true,
    action: "read",
    blockCount,
    connectorCount,
  });
}

/** PUT /api/workspaces/[id] — create-or-update (the client always knows its
 *  own board id, generated client-side, so there's no separate POST-to-create
 *  step — same debounced-autosave shape as the existing localStorage layer,
 *  just also written to Postgres). Owner or EDITOR collaborator only — a
 *  VIEWER share can read but not write.
 *
 *  A write to an existing board must say which revision it was built on, and
 *  is refused with 409 if the stored revision has moved on — the same rule as
 *  Mindmap.revision (see app/api/mindmaps/[mindmapId]/sync-tree/route.ts).
 *  Not having it was the worst defect in this engine: two people editing one
 *  board did not conflict, the second save simply overwrote the first, and
 *  nobody was told. Absence of a realtime transport made that *more* likely,
 *  not less, because neither side could see the other's work arrive.
 *
 *  A caller that cannot say which revision it built on cannot be ordered
 *  against a concurrent writer at all, so it is refused too rather than
 *  allowed to overwrite blindly — which for a stale tab running older code is
 *  exactly the right answer: reload and try again. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    title, blocks, blockOrder, connectors, camera, frames, editOperation, baseRevision,
    treeLayoutDirection, treeGrowthMode, treeLayoutFamily,
    treeTimelineBranchMode, treeTimelineDescendantStyle, treeCatalogDescendantStyle,
  } = body;
  if (typeof title !== "string" || blocks === undefined || blocks === null
    || blockOrder === undefined || blockOrder === null
    || connectors === undefined || connectors === null
    || camera === undefined || camera === null) {
    return NextResponse.json({ error: "title, blocks, blockOrder, connectors, camera required" }, { status: 400 });
  }
  const treeLayoutFields = {
    treeLayoutDirection: asOptionalString(treeLayoutDirection),
    treeGrowthMode: asOptionalString(treeGrowthMode),
    treeLayoutFamily: asOptionalString(treeLayoutFamily),
    treeTimelineBranchMode: asOptionalString(treeTimelineBranchMode),
    treeTimelineDescendantStyle: asOptionalString(treeTimelineDescendantStyle),
    treeCatalogDescendantStyle: asOptionalString(treeCatalogDescendantStyle),
  };

  const existing = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (existing) {
    const role = await resolveAccessRole(existing, email);
    if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Unlike "no access" (hidden as 404 above to avoid leaking existence), a
    // VIEWER already legitimately knows this board exists — 403 is accurate,
    // not a leak.
    if (role === "VIEWER") return NextResponse.json({ error: "Read-only access" }, { status: 403 });
    if (!Number.isInteger(baseRevision) || (baseRevision as number) < 0) {
      return NextResponse.json(
        { error: "baseRevision (integer) is required to update an existing board", reason: "no_base" },
        { status: 400 },
      );
    }
  }

  const editEvents = [
    ...collectBlockEditEvents(
      params.id, asBlockRecord(existing?.blocks), asBlockRecord(blocks), email, editOperation,
    ),
    ...collectConnectorEditEvents(
      params.id, asBlockRecord(existing?.connectors), asBlockRecord(connectors), email,
    ),
  ];
  if (body.documentState !== undefined) {
    const { validateDocumentCheckpoint } = await import("@/lib/workspace/document-checkpoint");
    if (!validateDocumentCheckpoint(body.documentState, blocks)) {
      return NextResponse.json({ error: "Document checkpoint does not match its content", reason: "invalid_document_state" }, { status: 400 });
    }
  }
  const content = {
    title,
    blocks: blocks as Prisma.InputJsonValue,
    blockOrder: blockOrder as Prisma.InputJsonValue,
    connectors: connectors as Prisma.InputJsonValue,
    camera: camera as Prisma.InputJsonValue,
    ...(typeof body.documentState === "string" ? { documentState: body.documentState } : {}),
    ...(frames !== undefined ? { frames: frames as Prisma.InputJsonValue } : {}),
    ...treeLayoutFields,
  };

  // Everything from here — the compare-and-swap, the history rows, the
  // automatic checkpoint, the search reindex — is shared with the realtime
  // service's own flush (POST .../sync-board) rather than written twice. See
  // lib/workspace/boardCommit.ts for why that matters.
  const outcome = await commitBoardContent({
    boardId: params.id,
    actorEmail: email,
    content,
    editEvents,
    baseRevision: Number.isInteger(baseRevision) ? (baseRevision as number) : null,
    existing,
    ...(workspaceRealtimeDeliveryConfigured() ? {
      writeRealtimeOutbox: (tx, committed) => enqueueWorkspaceRealtimePatch(tx, {
        boardId: params.id, revision: committed.revision, patch: repositoryBoardPatch(existing, content),
      }),
    } : {}),
  });

  if ("gone" in outcome) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ("stale" in outcome) {
    return NextResponse.json(
      { error: "This board changed since you loaded it", reason: "stale", revision: outcome.revision },
      { status: 409 },
    );
  }

  await drainWorkspaceRealtimeOutbox(20, params.id).catch(error => console.warn("[workspace] REST save notification will retry", error));
  return NextResponse.json(withoutDocumentState(outcome.board));
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** DELETE /api/workspaces/[id] */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await resolveWorkspaceCallerEmail(req);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // requireOwnedBoard rather than a hand-rolled `ownerEmail !== email`: the
  // shared helper compares identities case-insensitively, so an owner whose
  // board row predates email normalization can still delete their own board.
  const existing = await requireOwnedBoard(params.id, email);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.sourceMindmapId) {
    // Keep the old Mindmap row as rollback data, but mark it as intentionally
    // deleted so the next idempotent cutover cannot recreate this board.
    await prisma.$transaction([
      prisma.workspaceBoard.delete({ where: { id: params.id } }),
      prisma.mindmap.updateMany({
        where: { id: existing.sourceMindmapId },
        data: { workspaceDeletedAt: new Date() },
      }),
    ]);
  } else {
    await prisma.workspaceBoard.delete({ where: { id: params.id } });
  }
  return NextResponse.json({ ok: true });
}
