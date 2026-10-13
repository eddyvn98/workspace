/** Reads a Dify chat-messages SSE response and reports each incremental
 *  answer via onText, mirroring legacy Mindmap's consumeMindmapChatResponse
 *  (app/mindmap/utils/mindmap-chat-stream.ts) event-for-event so both
 *  engines render AI progress the same way against the same backend. */
import type { WorkspaceTurnProgressEvent } from "@/lib/workspace-agent/contracts";

type WorkspaceStreamPayload = {
  event?: string;
  answer?: string;
  text?: string;
  message?: string;
  conversation_id?: string;
  task_id?: string;
  sequence?: number;
  phase?: WorkspaceTurnProgressEvent["phase"];
  round?: number;
  persistedCount?: number;
  revision?: number;
  data?: { text?: string; outputs?: Record<string, unknown> };
};

export type WorkspaceRuntimeProgressEvent = WorkspaceTurnProgressEvent & { event: "workspace_runtime_progress" };

function getDelta(payload: WorkspaceStreamPayload): string {
  if (payload.event === "text_chunk") return payload.data?.text ?? "";
  if (payload.event === "message" || payload.event === "agent_message") {
    return payload.answer ?? payload.text ?? payload.message ?? "";
  }
  return "";
}

function getWorkflowAnswer(payload: WorkspaceStreamPayload): string {
  if (payload.event !== "workflow_finished" || !payload.data?.outputs) return "";
  const answer = payload.data.outputs.answer;
  return typeof answer === "string" ? answer : "";
}

export interface WorkspaceStreamResult {
  answer: string;
  conversationId: string | null;
  taskId: string | null;
}

/** Reads Dify's SSE response while preserving a JSON fallback for older agents.
 *  `onTaskId` fires once, as soon as Dify's task id is known — needed to call
 *  the provider's stop-task endpoint if the caller aborts this request. */
export async function consumeWorkspaceChatResponse(
  response: Response,
  onText: (text: string) => void,
  onTaskId?: (taskId: string) => void,
  onProgress?: (event: WorkspaceRuntimeProgressEvent) => void,
): Promise<WorkspaceStreamResult> {
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (contentType.includes("application/json") || !response.body) {
    const data = (await response.json()) as { answer?: string; conversation_id?: string; task_id?: string };
    const answer = data.answer ?? "";
    if (answer) onText(answer);
    if (data.task_id) onTaskId?.(data.task_id);
    return { answer, conversationId: data.conversation_id ?? null, taskId: data.task_id ?? null };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let answer = "";
  let conversationId: string | null = null;
  let taskId: string | null = null;
  let progressSequence = 0;

  const consumeLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) return;
    const payloadText = line.slice(5).trim();
    if (!payloadText || payloadText === "[DONE]") return;

    let payload: WorkspaceStreamPayload | null = null;
    try {
      payload = JSON.parse(payloadText) as WorkspaceStreamPayload;
    } catch {
      return; // SSE partial chunk split mid-line
    }
    if (!payload) return;
    if (payload.event === "workspace_runtime_progress") {
      const phases: WorkspaceTurnProgressEvent["phase"][] = ["model_step", "executing", "persisted", "completed"];
      if (!Number.isSafeInteger(payload.sequence) || payload.sequence! <= progressSequence || !phases.includes(payload.phase!)) return;
      progressSequence = payload.sequence!;
      onProgress?.({
        event: "workspace_runtime_progress",
        sequence: payload.sequence!,
        phase: payload.phase!,
        ...(Number.isSafeInteger(payload.round) && payload.round! >= 0 ? { round: payload.round } : {}),
        ...(Number.isSafeInteger(payload.persistedCount) && payload.persistedCount! >= 0 ? { persistedCount: payload.persistedCount } : {}),
        ...(Number.isSafeInteger(payload.revision) && payload.revision! >= 0 ? { revision: payload.revision } : {}),
      });
      return;
    }
    if (payload.event === "error") {
      throw new Error(payload.message || "AI stream failed");
    }
    if (payload.conversation_id && !conversationId) conversationId = payload.conversation_id;
    if (payload.task_id && !taskId) {
      taskId = payload.task_id;
      onTaskId?.(taskId);
    }

    const delta = getDelta(payload);
    if (delta) {
      answer += delta;
      onText(answer);
      return;
    }

    // Dify may stream an intermediate agent answer before emitting the
    // workflow's final output. The final output is authoritative — keeping
    // the earlier chunks here can apply stale actions to the canvas.
    const workflowAnswer = getWorkflowAnswer(payload);
    if (workflowAnswer) {
      answer = workflowAnswer;
      onText(answer);
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
      if (done) break;
    }
    if (buffer) consumeLine(buffer);
    return { answer, conversationId, taskId };
  } finally {
    reader.releaseLock();
  }
}
