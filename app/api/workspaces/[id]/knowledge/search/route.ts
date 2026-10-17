/**
 * POST /api/workspaces/[id]/knowledge/search — search a board's knowledge
 * base on demand, instead of every prompt carrying the whole thing.
 * Workspace counterpart of
 * app/api/mindmaps/[mindmapId]/knowledge/search/route.ts.
 *
 * Dual auth, because this is meant to be called two ways:
 *
 *  1. Server-to-server from the agent's tool-calling webhook, where no
 *     browser session exists — the service key authenticates Dify and the
 *     signed workspace_user_token identifies the human it acts for. That
 *     person's board access is still checked; a service key is not a bypass.
 *  2. A normal session, for calling it from the app itself.
 *
 * Scope note: this searches both kinds of chunk a board has — the DOCUMENT
 * chunks of files it was given, and the BLOCK chunks of the text written on
 * the canvas itself (written by the board save since OPEN-13) — and now also
 * returns the structural half: the `graph` field walks tree parent/child and
 * connector links out from whichever blocks matched, so an answer can cite a
 * connection ("linked to the Q3 budget block"), not just a block's own words.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceCallerAuth } from "../../../_auth";
import {
  requireBoardRead,
  WorkspaceAccessError,
} from "@/lib/workspace/knowledge-repository";
import {
  hybridSearchKnowledge,
  searchKnowledge,
  withDocumentFilenames,
} from "@/lib/workspace/knowledge-search";
import { buildGraphForHits } from "@/lib/workspace/canvas-graph-repository";

type RouteParams = { params: { id: string } };

const MAX_LIMIT = 50;

export async function POST(req: NextRequest, { params }: RouteParams) {
  const body = await req.json().catch(() => ({}));
  const query = typeof body?.query === "string" ? body.query : "";
  const mode = body?.mode === "fulltext" ? "fulltext" : "hybrid";
  const rawLimit = typeof body?.limit === "number" ? body.limit : 8;
  // Clamped rather than trusted: this is reachable by a webhook, and an
  // unbounded limit would let one call pull a board's whole knowledge base.
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT) : 8;
  const rawSelectedBlockIds: unknown[] = Array.isArray(body?.selectedBlockIds) ? body.selectedBlockIds : [];
  const selectedBlockIds = rawSelectedBlockIds.reduce((ids: string[], id: unknown) => {
    if (typeof id !== "string") return ids;
    const normalized = id.trim();
    if (normalized && !ids.includes(normalized)) ids.push(normalized);
    return ids;
  }, []).slice(0, 64);
  const maxHops = typeof body?.maxHops === "number" ? body.maxHops : undefined;
  const maxNodes = typeof body?.maxNodes === "number" ? body.maxNodes : undefined;

  // Accept both browser sessions and Dify's service-key + signed
  // `workspace_user_token` request. The latter must be verified here: a
  // client-supplied callerEmail is not an identity proof, and the token is the
  // field the Dify Custom Tool contract actually sends.
  const auth = await resolveWorkspaceCallerAuth(req, body);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message, code: auth.code },
      { status: auth.status },
    );
  }
  const callerEmail = auth.email;

  if (!query.trim()) return NextResponse.json({ error: "query is required" }, { status: 400 });

  try {
    // Access is resolved before any search runs, so a board the caller cannot
    // open never has its content ranked, let alone returned.
    await requireBoardRead(params.id, callerEmail);
    const hits = mode === "fulltext"
      ? await searchKnowledge(params.id, query, limit)
      : await hybridSearchKnowledge(params.id, query, limit);
    // Filenames resolved after ranking, so the extra query runs once for the
    // page being returned rather than for every candidate the legs produced.
    // The graph walk starts from these SAME hits (whichever mode produced
    // them) rather than running its own search, so mode never has to be
    // decided twice.
    const [results, graph] = await Promise.all([
      withDocumentFilenames(hits),
      buildGraphForHits(params.id, hits, { selectedBlockIds, maxHops, maxNodes }),
    ]);
    return NextResponse.json({ results, graph });
  } catch (err) {
    if (err instanceof WorkspaceAccessError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 404 },
      );
    }
    // Do not expose database query errors, credentials, or internal paths to
    // browser or model-tool clients. The request has already been authorized.
    return NextResponse.json({ error: "Knowledge search unavailable" }, { status: 500 });
  }
}
