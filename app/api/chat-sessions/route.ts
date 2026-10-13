import { NextRequest, NextResponse } from "next/server";
import { isTrackedChatSessionCategory } from "@/lib/chat-sessions/categories";
import { listChatSessions, upsertChatSession } from "@/services/mongodb/chatSessions.repo";
import type { ChatSessionCategory } from "@/types/chat-sessions.types";
import { canReadBoard, failure, sessionCaller, validBoardId } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categories = new Set<ChatSessionCategory>(["CHAT_KEY", "IMAGE_KEY", "VIDEO_GEN_EDIT_KEY", "COMPLIANCE_KEY", "WORKSPACE_AGENT_CHAT_KEY"]);
const isCategory = (value: unknown): value is ChatSessionCategory => typeof value === "string" && categories.has(value as ChatSessionCategory);
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

export async function GET(req: NextRequest) {
  const email = await sessionCaller(req);
  if (!email) return failure("Unauthorized", 401);
  const query = req.nextUrl.searchParams;
  const category = query.get("category");
  if (category && !isCategory(category)) return failure("Invalid chat category", 400);
  const boardId = query.get("workspaceBoardId");
  if (boardId !== null && (!validBoardId(boardId) || !await canReadBoard(boardId, email))) return failure("Not found", 404);
  if (category === "WORKSPACE_AGENT_CHAT_KEY" && !boardId) return failure("workspaceBoardId is required for Workspace history", 400);
  const limitValue = query.get("limit");
  const parsed = limitValue === null ? 30 : Number(limitValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return failure("limit must be between 1 and 100", 400);
  const cursor = query.get("cursor") ?? undefined;
  if (cursor && cursor.length > 1000) return failure("Invalid cursor", 400);
  const pinned = query.get("pinned");
  if (pinned !== null && pinned !== "true" && pinned !== "false") return failure("Invalid pinned filter", 400);
  try {
    const result = await listChatSessions({
      userId: email, limit: parsed, ...(category ? { categories: [category] } : {}),
      ...(boardId ? { workspaceBoardId: boardId } : {}),
      ...(cursor ? { cursor } : {}),
      ...(pinned === null ? {} : { pinned: pinned === "true" }),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure("Chat history storage is unavailable", 503);
  }
}

function validMessages(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length > 200) return false;
  let bytes = 0;
  for (const entry of value) {
    if (!isObject(entry) || !["user", "assistant"].includes(String(entry.role))
      || typeof entry.content !== "string" || entry.content.length > 16000) return false;
    bytes += entry.content.length;
  }
  return bytes <= 250000;
}

export async function POST(req: NextRequest) {
  const email = await sessionCaller(req);
  if (!email) return failure("Unauthorized", 401);
  const body: unknown = await req.json().catch(() => null);
  if (!isObject(body) || !isCategory(body.category)
    || !isTrackedChatSessionCategory(body.category)
    || typeof body.difyConversationId !== "string" || body.difyConversationId.length < 1 || body.difyConversationId.length > 128
    || (body.title !== undefined && (typeof body.title !== "string" || body.title.length > 100))
    || (body.region !== undefined && body.region !== null && body.region !== "SG")
    || (body.workspaceMessages !== undefined && !validMessages(body.workspaceMessages))) {
    return failure("Invalid chat session payload", 400);
  }
  const workspaceBoardId = body.workspaceBoardId;
  if (body.category === "WORKSPACE_AGENT_CHAT_KEY" && !validBoardId(workspaceBoardId)) {
    return failure("workspaceBoardId is required for Workspace history", 400);
  }
  if (workspaceBoardId !== undefined && (!validBoardId(workspaceBoardId) || !await canReadBoard(workspaceBoardId, email))) {
    return failure("Not found", 404);
  }
  if (body.region === "SG" && body.category !== "COMPLIANCE_KEY") return failure("Region is unsupported for this category", 400);
  try {
    const doc = await upsertChatSession({
      userId: email,
      category: body.category,
      difyConversationId: body.difyConversationId,
      ...(typeof body.title === "string" && body.title.trim() ? { title: body.title.trim() } : {}),
      ...(body.region === "SG" ? { region: "SG" as const } : {}),
      ...(validMessages(body.workspaceMessages) ? { workspaceMessages: body.workspaceMessages } : {}),
      ...(typeof workspaceBoardId === "string" ? { workspaceBoardId } : {}),
    });
    return NextResponse.json(doc, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure("Chat history storage is unavailable", 503);
  }
}
