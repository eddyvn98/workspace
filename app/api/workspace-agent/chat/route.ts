import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { resolveWorkspaceCallerAuth } from "@/app/api/workspaces/_auth";
import { resolveAccessRole } from "@/app/api/workspaces/_access";
import { prisma } from "@/lib/prisma";
import { signWorkspaceAgentUserToken } from "@/lib/workspace/agentAuth";
import { buildWorkspaceAgentInputs } from "@/app/workspace/utils/workspaceChatRequest";
import { mergeWorkspaceProgressStream } from "@/lib/workspace-agent/progressStream";
import { readWorkspaceTurnProgress } from "@/lib/workspace-agent/progressStore";
import { workspaceAgentTurnPayloadHash } from "@/lib/workspace-agent/turnStore";

function getRuntimeEndpoint(req: NextRequest, boardId: string): URL {
  const configuredOrigin = process.env.WORKSPACE_INTERNAL_API_ORIGIN?.trim();
  const origin = configuredOrigin || (process.env.NODE_ENV === "production"
    ? `http://127.0.0.1:${process.env.PORT || "80"}`
    : req.nextUrl.origin);
  return new URL(`/api/workspaces/${encodeURIComponent(boardId)}/agent/runtime`, origin);
}

function getRuntimeErrorCauseCode(error: unknown): string | undefined {
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  while (pending.length) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const record = current as { code?: unknown; cause?: unknown; errors?: unknown };
    if (typeof record.code === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(record.code)) return record.code;
    if (record.cause) pending.push(record.cause);
    if (Array.isArray(record.errors)) pending.push(...record.errors.slice(0, 3));
  }
  return undefined;
}

function getRuntimeFailureCode(error: unknown, phase: string): string {
  const errorName = error instanceof Error ? error.name : "unknown";
  const message = error instanceof Error ? error.message : "";
  if (phase === "mint_user_token" && message.includes("WORKSPACE_AGENT_TOKEN_SECRET")) {
    return "token_signing_secret_missing";
  }
  const causeCode = getRuntimeErrorCauseCode(error);
  if (phase === "runtime_fetch") return `runtime_fetch_${causeCode ?? "failed"}`;
  if (phase === "runtime_response" && error instanceof SyntaxError) return "runtime_response_invalid_json";
  const safeName = errorName.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 40);
  return `${phase}_${safeName || "unknown_error"}`;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await resolveWorkspaceCallerAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || typeof body.boardId !== "string" || body.boardId.length > 128
    || typeof body.turnId !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(body.turnId)
    || typeof body.query !== "string" || !body.query.trim() || body.query.length > 12_000
    || typeof body.modelSelector !== "string" || !body.modelSelector.trim() || body.modelSelector.length > 200
    || typeof body.context !== "string" || body.context.length > 12_000
    || (body.conversationId !== null && body.conversationId !== undefined && (typeof body.conversationId !== "string" || body.conversationId.length > 128))) {
    return NextResponse.json({ error: "Invalid Workspace runtime chat request" }, { status: 400 });
  }
  const board = await prisma.workspaceBoard.findUnique({ where: { id: body.boardId } });
  if (!board || !await resolveAccessRole(board, auth.email)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const serviceKey = process.env.NODE_ENV === "production"
    ? process.env.WORKSPACE_AGENT_SERVICE_KEY
    : process.env.WORKSPACE_AGENT_SERVICE_KEY_LOCAL || process.env.WORKSPACE_AGENT_SERVICE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Workspace runtime authentication is not configured" }, { status: 503 });
  let phase = "mint_user_token";
  try {
    const minted = await signWorkspaceAgentUserToken(auth.email);
    const inputs = buildWorkspaceAgentInputs(body.boardId, body.modelSelector);
    const payloadHash = workspaceAgentTurnPayloadHash({ query: body.query.trim(), modelSelector: inputs.model_selector, context: body.context });
    phase = "runtime_fetch";
    const upstream = await fetch(getRuntimeEndpoint(req, body.boardId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        "X-Workspace-User-Token": minted.token,
        ...(req.headers.get("cookie") ? { Cookie: req.headers.get("cookie")! } : {}),
      },
      body: JSON.stringify({
        turnId: body.turnId,
        query: body.query.trim(),
        context: body.context,
        modelSelector: inputs.model_selector,
        conversationId: body.conversationId ?? null,
        workspace_user_token: minted.token,
      }),
      signal: req.signal,
    });
    phase = "runtime_response";
    if (!upstream.ok) {
      // Runtime error bodies may contain internal service URLs or credentials.
      // Preserve the HTTP status for callers but never reflect upstream text.
      return NextResponse.json({ error: "Workspace runtime request failed" }, { status: upstream.status });
    }
    const turn = await upstream.json() as {
      answer: string;
      conversationId: string | null;
      focusBlockIds: string[];
      appliedSummaries: string[];
      unresolvedSummaries: string[];
      receipts: unknown[];
    };
    phase = "parse_runtime_answer";
    let runtimeAnswer: Record<string, unknown>;
    try {
      runtimeAnswer = JSON.parse(turn.answer) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Workspace runtime returned an invalid chat answer" }, { status: 502 });
    }
    const answer = JSON.stringify({ ...runtimeAnswer, receipts: turn.receipts });
    const encoder = new TextEncoder();
    const upstreamStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: "workflow_finished", conversation_id: turn.conversationId, data: { outputs: { answer } } })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const key = { boardId: body.boardId, actorEmail: auth.email, turnId: body.turnId };
    const stream = mergeWorkspaceProgressStream(upstreamStream,
      (sequence) => readWorkspaceTurnProgress(key, sequence, payloadHash), req.signal);
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    const traceId = randomUUID();
    const failureCode = getRuntimeFailureCode(error, phase);
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const causeCode = getRuntimeErrorCauseCode(error);
    const diagnostics = { traceId, phase, failureCode, errorName, ...(causeCode ? { causeCode } : {}) };
    console.error("[workspace-runtime-chat]", {
      ...diagnostics,
      turnId: body.turnId,
    });
    const debug = process.env.WORKSPACE_RUNTIME_DEBUG === "1" ? { diagnostics } : {};
    return NextResponse.json({ error: "Workspace runtime is temporarily unavailable", ...debug }, { status: 502 });
  }
}
