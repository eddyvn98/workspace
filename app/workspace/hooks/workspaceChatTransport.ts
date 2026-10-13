import { sendToDifyWithRepair, type SendToDifyParams, type SendToDifyResult } from "./workspaceChatDifySend";
import { stopDifyTask } from "./workspaceChatSendHelpers";
import { consumeWorkspaceChatResponse, type WorkspaceRuntimeProgressEvent } from "../utils/workspaceChatStream";

export interface WorkspaceAgentProvider {
  send(input: WorkspaceAgentTurn): Promise<SendToDifyResult>;
  cancel(input: WorkspaceAgentCancellation): Promise<void>;
}
export interface WorkspaceAgentTurn extends SendToDifyParams {
  turnId: string;
  context: string;
  runtime: boolean;
  onProgress?: (event: WorkspaceRuntimeProgressEvent) => void;
}
export interface WorkspaceAgentCancellation {
  taskId?: string | null;
  turnId?: string;
  boardId?: string;
  user: string | null;
}

export function isWorkspaceRuntimePilot(): boolean {
  return typeof window !== "undefined" && resolveWorkspaceRuntimePilot(
    window.location.search,
    process.env.NEXT_PUBLIC_WORKSPACE_RUNTIME_DEFAULT === "1",
  );
}

export function resolveWorkspaceRuntimePilot(search: string, defaultEnabled: boolean): boolean {
  const override = new URLSearchParams(search).get("agentRuntime");
  if (override === "1") return true;
  if (override === "0") return false;
  return defaultEnabled;
}

export const difyWorkspaceAgentProvider: WorkspaceAgentProvider = {
  async send(input) {
    if (!input.runtime) return sendToDifyWithRepair(input);
    if (input.filesPayload.length) throw new Error("Runtime pilot does not support attachments.");
    const response = await fetch("/api/workspace-agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boardId: input.boardId,
        turnId: input.turnId,
        context: input.context,
        modelSelector: input.modelIdentifier,
        query: input.userDisplayContent,
        conversationId: input.conversationId,
      }),
      signal: input.signal,
    });
    if (!response.ok || !response.body) throw new Error(`Runtime chat request failed (${response.status})`);
    const streamed = await consumeWorkspaceChatResponse(response, () => {}, input.onTaskId, input.onProgress);
    return { fullText: streamed.answer, conversationId: streamed.conversationId, invalidActionResponse: false };
  },
  async cancel(input) {
    const stops: Promise<unknown>[] = [];
    if (input.turnId && input.boardId) stops.push(fetch(`/api/workspaces/${encodeURIComponent(input.boardId)}/agent/runtime/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnId: input.turnId }),
    }).then((response) => { if (!response.ok) throw new Error(`Runtime cancellation failed (${response.status})`); }));
    if (input.taskId) stops.push(stopDifyTask(input.taskId, input.user));
    const results = await Promise.allSettled(stops);
    for (const result of results) if (result.status === "rejected") console.error("Workspace cancellation failed", result.reason);
  },
};
