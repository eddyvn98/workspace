import { NextRequest, NextResponse } from "next/server";
import { resolveWorkspaceCallerEmail } from "@/app/api/workspaces/_auth";
import { resolveAccessRole } from "@/app/api/workspaces/_access";
import { prisma } from "@/lib/prisma";
import type { ChatSession } from "@/types/chat-sessions.types";

export const failure = (message: string, status: number) => NextResponse.json({ error: message }, { status });

/** Browser-only history endpoints: signed-in email, never caller-supplied userId. */
export async function sessionCaller(req: NextRequest): Promise<string | null> {
  return resolveWorkspaceCallerEmail(req);
}

export async function canReadSessionBoard(session: Pick<ChatSession, "workspaceBoardId">, email: string): Promise<boolean> {
  if (!session.workspaceBoardId) return true;
  const board = await prisma.workspaceBoard.findUnique({ where: { id: session.workspaceBoardId } });
  return Boolean(board && await resolveAccessRole(board, email));
}

export async function canReadBoard(boardId: string, email: string): Promise<boolean> {
  const board = await prisma.workspaceBoard.findUnique({ where: { id: boardId } });
  return Boolean(board && await resolveAccessRole(board, email));
}

export function validBoardId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}
