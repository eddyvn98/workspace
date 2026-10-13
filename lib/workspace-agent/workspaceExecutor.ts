import { NextRequest } from "next/server";
import type { WorkspaceBoardSnapshot, WorkspaceJson, WorkspaceRuntimeRequest } from "./contracts";

export interface WorkspaceExecutorResult {
  httpStatus: number;
  body: WorkspaceJson;
}

async function invokeWorkspaceAgent(
  input: WorkspaceRuntimeRequest,
  body: WorkspaceJson,
): Promise<WorkspaceExecutorResult> {
  const request = new NextRequest(`http://workspace.local/api/workspaces/${encodeURIComponent(input.boardId)}/agent`, {
    method: "POST",
    headers: {
      Authorization: input.authorization,
      "X-Workspace-User-Token": input.workspaceUserToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });
  const { POST: workspaceAgentPost } = await import("@/app/api/workspaces/[id]/agent/route");
  const response = await workspaceAgentPost(request, { params: { id: input.boardId } });
  const result = await response.json().catch(() => ({})) as WorkspaceJson;
  return { httpStatus: response.status, body: result };
}

export async function readWorkspaceSnapshot(input: WorkspaceRuntimeRequest): Promise<WorkspaceBoardSnapshot> {
  const result = await invokeWorkspaceAgent(input, { action: "read" });
  const board = result.body.board;
  if (!result.body.success || !board || typeof board !== "object" || Array.isArray(board)) {
    throw new Error(typeof result.body.error === "string" ? result.body.error : `Workspace read failed (${result.httpStatus}).`);
  }
  const snapshot = board as WorkspaceJson;
  if (!Number.isInteger(snapshot.revision) || typeof snapshot.title !== "string") {
    throw new Error("Workspace read returned an invalid board snapshot.");
  }
  return snapshot as WorkspaceBoardSnapshot;
}

export function executeWorkspaceActions(
  input: WorkspaceRuntimeRequest,
  turnId: string,
  round: number,
  baseRevision: number,
  actions: WorkspaceJson[],
): Promise<WorkspaceExecutorResult> {
  return invokeWorkspaceAgent(input, {
    requestId: `${turnId}:${round}`,
    runtimeTurnId: turnId,
    baseRevision,
    actions,
    editOperation: "ai.workspace-runtime",
  });
}
