import { inspectWorkspaceChatActionAnswer } from "../utils/workspaceChatActions";
import { consumeWorkspaceChatResponse } from "../utils/workspaceChatStream";
import { isStructuredDifyAnswer } from "../utils/workspaceDifyAgentResponse";
import {
  buildWorkspaceAgentInputs,
  buildWorkspaceResponseLanguageInstruction,
  isWorkspaceMutationRequest,
  WORKSPACE_CHAT_CATEGORY,
} from "../utils/workspaceChatRequest";

/** Builds the outbound Dify query. Dify's Workspace Agent owns canvas
 * mutations through its native workspace_action tool; do not ask it to emit
 * the legacy workspace-actions envelope that the browser applies itself. */
export function buildWorkspaceSendPrompt({
  userDisplayContent,
  selectionPrompt,
  knowledgeText,
}: {
  userDisplayContent: string;
  selectionPrompt: string;
  knowledgeText?: string;
}): string {
  const mutationRequested = isWorkspaceMutationRequest(userDisplayContent);
  return [
    knowledgeText ? `${knowledgeText}\n\n## End of workspace evidence` : "",
    buildWorkspaceResponseLanguageInstruction(userDisplayContent),
    "## User request",
    userDisplayContent,
    selectionPrompt,
    mutationRequested
      ? "For canvas changes, use the available Workspace action tools and report only changes confirmed by their receipts. For a multi-part request, track one checklist item per requested outcome and match each item to its own successful changed-action receipt; a changed board does not prove every item succeeded. Put every item without a matching receipt in unresolvedSummaries and clearly say the result is partial. Respect explicit upper/lower/above/below constraints using supplied canvas coordinates; selection must not override a conflicting position. Do not emit a legacy workspace-actions JSON block."
      : "",
  ].filter(Boolean).join("\n\n");
}

export interface DifyFilePayload {
  type: string;
  transfer_method: string;
  url: string;
  upload_file_id?: string;
}

export interface SendToDifyParams {
  boardId: string;
  modelIdentifier: string;
  promptToSend: string;
  user: string | null;
  filesPayload: DifyFilePayload[];
  conversationId: string | null;
  userDisplayContent: string;
  signal: AbortSignal;
  onTaskId: (taskId: string) => void;
}

export interface SendToDifyResult {
  fullText: string;
  conversationId: string | null;
  invalidActionResponse: boolean;
}

/** Sends one turn to Dify. Only malformed legacy action envelopes receive a
 * bounded compatibility repair; ordinary agent prose is not retried as a
 * browser-applied action request. */
export async function sendToDifyWithRepair({
  boardId,
  modelIdentifier,
  promptToSend,
  user,
  filesPayload,
  conversationId: initialConversationId,
  userDisplayContent,
  signal,
  onTaskId,
}: SendToDifyParams): Promise<SendToDifyResult> {
  // `any` here: this mirrors Dify's own chat-messages request contract
  // (inputs/query/response_mode/user/conversation_id/files), which has no
  // shared type in this codebase — `files` in particular is only appended
  // conditionally below, so a precise interface would just repeat this
  // comment as a type. JSON.stringify below is the only consumer.
  const bodyPayload: Record<string, unknown> = {
    // The Dify Workspace Agent Start node's only two custom inputs — see
    // buildWorkspaceAgentInputs. `boardId` is the current WorkspaceBoard.id
    // (the `/workspace?id=` URL value, synced into the store by
    // useWorkspacePersistence's `adopt`), not a legacy Mindmap id.
    inputs: buildWorkspaceAgentInputs(boardId, modelIdentifier),
    query: promptToSend,
    response_mode: "streaming",
    // Shown on the wire for visibility only — /api/chat/messages always
    // re-derives and overwrites this from the authenticated session before
    // forwarding to Dify, so a stale/wrong value here can never reach Dify
    // as the caller's identity.
    user,
    ...(initialConversationId ? { conversation_id: initialConversationId } : {}),
  };

  if (filesPayload.length > 0) {
    bodyPayload.files = filesPayload;
  }

  const res = await fetch("/api/chat/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-category": WORKSPACE_CHAT_CATEGORY },
    body: JSON.stringify(bodyPayload),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed (${res.status})`);
  }

  // Keep the streamed answer out of the bubble until it passes the
  // action-contract guard. Otherwise a malformed JSON envelope flashes in
  // the UI and may be mistaken for an executed action.
  const { answer: initialText, conversationId: firstConversationId } =
    await consumeWorkspaceChatResponse(res, () => {}, onTaskId);
  let fullText = initialText;
  let conversationId = firstConversationId;
  let invalidActionResponse = false;
  const initialActionPayload = inspectWorkspaceChatActionAnswer(initialText);
  const initialIsStructured = isStructuredDifyAnswer(initialText);
  const looksLikeActionResponse = /"actions"\s*:/i.test(initialText)
    || /"type"\s*:\s*"(?:create_map|add_child|rename_topic|update_node|delete_node|create_shape)"/i.test(initialText);
  // One bounded repair turn gives the model a chance to re-emit the same
  // malformed legacy action envelope. It uses the same Dify conversation,
  // sends no files or new user intent, and never retries recursively.
  if (looksLikeActionResponse && !initialIsStructured && initialActionPayload.validEnvelope !== true) {
    try {
      const repairRes = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-category": WORKSPACE_CHAT_CATEGORY },
        body: JSON.stringify({
          inputs: bodyPayload.inputs,
          query: [
            "Your previous response failed the Workspace action JSON contract.",
            "Repair and re-emit the complete result now.",
            "Return ONLY one valid JSON object with this exact shape: {\"message\":\"...\",\"actions\":[...]}",
            "Every action must be a complete object with a supported type and valid target identifiers.",
            "Do not leave an empty actions value, dangling commas, markdown fences, or explanatory prose.",
            "If a target cannot be resolved safely, omit that action and explain it in message.",
            buildWorkspaceResponseLanguageInstruction(userDisplayContent),
            `Original request: ${userDisplayContent}`,
            `Previous invalid response (repair this, do not copy its syntax): ${initialText.slice(0, 12000)}`,
            "Use the Workspace action tools for canvas changes. Return the normal structured agent response; do not emit legacy canvas actions.",
          ].join("\n"),
          response_mode: "streaming",
          user: bodyPayload.user,
          ...(conversationId ? { conversation_id: conversationId } : {}),
        }),
        signal,
      });
      if (!repairRes.ok || !repairRes.body) throw new Error(`Repair request failed (${repairRes.status})`);
      const repaired = await consumeWorkspaceChatResponse(repairRes, () => {}, onTaskId);
      fullText = repaired.answer;
      conversationId = repaired.conversationId || conversationId;
      const repairedActionPayload = inspectWorkspaceChatActionAnswer(fullText);
      const repairedIsStructured = isStructuredDifyAnswer(fullText);
      if (!repairedIsStructured && repairedActionPayload.validEnvelope !== true) {
        invalidActionResponse = true;
      }
    } catch (repairErr) {
      if ((repairErr as { name?: string })?.name === "AbortError") throw repairErr;
      invalidActionResponse = true;
    }
  }

  return { fullText, conversationId, invalidActionResponse };
}
