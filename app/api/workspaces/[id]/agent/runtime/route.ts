import { NextRequest, NextResponse } from "next/server";
import { hasWorkspaceAgentUserToken, readWorkspaceAgentUserTokenFromRequest } from "@/lib/workspace/agentAuth";
import { prisma } from "@/lib/prisma";
import { resolveAccessRole } from "../../../_access";
import { resolveWorkspaceCallerAuth } from "../../../_auth";
import { WORKSPACE_RUNTIME_DEADLINE_MS } from "@/lib/workspace-agent/contracts";
import { runWorkspaceAgentTurn } from "@/lib/workspace-agent/runtime";
import { beginWorkspaceTurn, completeWorkspaceTurn, isWorkspaceTurnCancelled } from "@/lib/workspace-agent/turnStore";
import { watchWorkspaceTurnCancellation } from "@/lib/workspace-agent/cancellationWatch";
import { appendWorkspaceTurnProgress } from "@/lib/workspace-agent/progressStore";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: "Invalid runtime request" }, { status: 400 });
  if (!/^Bearer\s+\S/i.test(req.headers.get("authorization") ?? "") || !hasWorkspaceAgentUserToken(req, body)) {
    return NextResponse.json({ error: "Workspace Agent credentials are required" }, { status: 401 });
  }
  if (
    typeof body.turnId !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(body.turnId)
    || typeof body.query !== "string" || !body.query.trim() || body.query.length > 12_000
    || typeof body.modelSelector !== "string" || !body.modelSelector.trim() || body.modelSelector.length > 200
    || (body.conversationId !== undefined && body.conversationId !== null && (typeof body.conversationId !== "string" || body.conversationId.length > 128))
    || (body.context !== undefined && (typeof body.context !== "string" || body.context.length > 12_000))
  ) {
    return NextResponse.json({ error: "turnId, query and modelSelector are required" }, { status: 400 });
  }

  const auth = await resolveWorkspaceCallerAuth(req, body);
  if (!auth.ok) return NextResponse.json({ error: auth.message, code: auth.code }, { status: auth.status });
  const board = await prisma.workspaceBoard.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await resolveAccessRole(board, auth.email);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const workspaceUserToken = readWorkspaceAgentUserTokenFromRequest(req, body);
  const authorization = req.headers.get("authorization");
  if (!workspaceUserToken || !authorization) return NextResponse.json({ error: "Workspace Agent credentials are required" }, { status: 401 });
  const turnKey = { boardId: params.id, actorEmail: auth.email, turnId: body.turnId };
  const turnStart = await beginWorkspaceTurn(turnKey, {
    query: body.query.trim(),
    modelSelector: body.modelSelector.trim(),
    context: typeof body.context === "string" ? body.context : "",
  });
  if (turnStart.kind === "replay") return NextResponse.json(turnStart.response);
  if (turnStart.kind === "payload_conflict") return NextResponse.json({ error: "turnId was already used for a different request", reason: "turn_id_conflict" }, { status: 409 });
  if (turnStart.kind === "running") return NextResponse.json({ error: "This Workspace turn is already running", reason: "turn_in_progress" }, { status: 409 });
  if (turnStart.kind === "cancelled") return NextResponse.json({ error: "This Workspace turn was cancelled", reason: "turn_cancelled" }, { status: 409 });
  if (turnStart.kind === "missing") return NextResponse.json({ error: "Workspace board is unavailable" }, { status: 404 });

  const deadline = new AbortController();
  const stopCancellationWatch = watchWorkspaceTurnCancellation(
    () => isWorkspaceTurnCancelled(turnKey),
    () => deadline.abort(new Error("Workspace runtime turn was cancelled")),
  );
  const abortForDisconnect = () => deadline.abort(req.signal.reason);
  if (req.signal.aborted) abortForDisconnect();
  else req.signal.addEventListener("abort", abortForDisconnect, { once: true });
  const timer = setTimeout(() => deadline.abort(new Error("Workspace runtime deadline exceeded")), WORKSPACE_RUNTIME_DEADLINE_MS);
  try {
    const turn = await runWorkspaceAgentTurn({
      boardId: params.id,
      turnId: body.turnId,
      query: body.query.trim(),
      ...(typeof body.context === "string" ? { context: body.context } : {}),
      modelSelector: body.modelSelector.trim(),
      conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
      authorization,
      workspaceUserToken,
      actorEmail: auth.email,
      canMutate: role !== "VIEWER",
      signal: deadline.signal,
    }, {
      isCancelled: () => isWorkspaceTurnCancelled(turnKey),
      onProgress: (event) => appendWorkspaceTurnProgress(turnKey, event),
    });
    const answer = JSON.stringify({
      answer: turn.answer,
      focusBlockIds: turn.focusBlockIds,
      appliedSummaries: turn.appliedSummaries,
      unresolvedSummaries: turn.unresolvedSummaries,
      verifiedRecordIds: turn.verifiedRecordIds ?? [],
    });
    const response = { ...turn, answer };
    if (!await completeWorkspaceTurn(turnKey, response)) {
      console.error("[workspace-agent-runtime]", { boardId: params.id, turnId: body.turnId, phase: "complete", errorCode: "turn_response_not_saved" });
      return NextResponse.json({ error: "The Workspace turn completed but its response could not be saved" }, { status: 503 });
    }
    try {
      await appendWorkspaceTurnProgress(turnKey, { phase: "completed" });
    } catch {
      console.error("[workspace-agent-progress]", { boardId: params.id, turnId: body.turnId, phase: "completed", errorCode: "progress_store_failed" });
    }
    return NextResponse.json(response);
  } finally {
    stopCancellationWatch();
    clearTimeout(timer);
    req.signal.removeEventListener("abort", abortForDisconnect);
  }
}
