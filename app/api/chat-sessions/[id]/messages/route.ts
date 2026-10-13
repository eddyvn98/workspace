import { NextRequest, NextResponse } from "next/server";
import { getChatSessionById } from "@/services/mongodb/chatSessions.repo";
import { resolveDifyChatEndpoint } from "@/app/config/difyEndpointResolver";
import { canReadSessionBoard, failure, sessionCaller } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Local Workspace snapshots preserve the actual user-facing turn/receipt.
 * Dify remains the model's independent conversation log; no command execution occurs here.
 * Legacy chats without a snapshot are read from Dify with the same authenticated end-user.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const email = await sessionCaller(req);
  if (!email) return failure("Unauthorized", 401);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(params.id)) return failure("Not found", 404);
  let session: Awaited<ReturnType<typeof getChatSessionById>>;
  try {
    session = await getChatSessionById(params.id);
  } catch {
    return failure("Chat history storage is unavailable", 503);
  }
  if (!session || session.userId !== email || !await canReadSessionBoard(session, email)) return failure("Not found", 404);

  if (Array.isArray(session.workspaceMessages) && session.workspaceMessages.length > 0) {
    return NextResponse.json({
      messages: session.workspaceMessages,
      conversation_id: session.difyConversationId,
      source: "workspace_snapshot",
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const config = session.category === "WORKSPACE_AGENT_CHAT_KEY"
    && process.env.WORKSPACE_AGENT_MODEL_STEP_DIFY_API_URL
    && process.env.WORKSPACE_AGENT_MODEL_STEP_DIFY_API_KEY
    ? { url: process.env.WORKSPACE_AGENT_MODEL_STEP_DIFY_API_URL, apiKey: process.env.WORKSPACE_AGENT_MODEL_STEP_DIFY_API_KEY }
    : resolveDifyChatEndpoint(session.category);
  if (!config.url || !config.apiKey) return failure("Dify conversation history is not configured", 503);
  let endpoint: URL;
  try {
    endpoint = new URL(config.url);
    if (!/\/chat-messages\/?$/.test(endpoint.pathname)) return failure("Invalid Dify conversation endpoint", 503);
    endpoint.pathname = endpoint.pathname.replace(/chat-messages\/?$/, "messages");
    endpoint.search = "";
    endpoint.searchParams.set("conversation_id", session.difyConversationId);
    endpoint.searchParams.set("user", email);
    endpoint.searchParams.set("limit", "50");
  } catch {
    return failure("Invalid Dify conversation endpoint", 503);
  }
  try {
    const upstream = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      cache: "no-store",
      signal: req.signal,
    });
    if (!upstream.ok) return failure("Dify conversation lookup failed", 502);
    const payload = await upstream.json() as { data?: unknown };
    if (!Array.isArray(payload.data)) return failure("Dify conversation response is invalid", 502);
    return NextResponse.json({
      data: payload.data.slice(0, 50),
      conversation_id: session.difyConversationId,
      source: "dify",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure("Dify conversation history is unavailable", 502);
  }
}
