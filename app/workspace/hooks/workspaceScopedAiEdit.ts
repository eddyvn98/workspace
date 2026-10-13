import { consumeWorkspaceChatResponse } from "../utils/workspaceChatStream";

function newTurnId(): string {
  return `workspace-edit:${crypto.randomUUID()}`;
}

export async function runWorkspaceScopedAiEdit(input: {
  boardId: string;
  modelSelector: string;
  query: string;
  context: string;
}): Promise<string> {
  const response = await fetch("/api/workspace-agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      boardId: input.boardId,
      turnId: newTurnId(),
      modelSelector: input.modelSelector,
      query: input.query,
      context: input.context,
      conversationId: null,
    }),
  });
  if (!response.ok || !response.body) throw new Error(`Workspace AI request failed (${response.status})`);
  const result = await consumeWorkspaceChatResponse(response, () => {});
  if (!result.answer.trim()) throw new Error("Could not read the AI response");
  return result.answer;
}

export function workspaceEditToastMessage(answer: string): string {
  const message = answer.replace(/\s+/g, " ").trim();
  return message.length > 220 ? `${message.slice(0, 217)}…` : message;
}
