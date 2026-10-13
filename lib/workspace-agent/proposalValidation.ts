import { validateWorkspaceRuntimeAction, validateWorkspaceRuntimeTableTarget } from "./actionSchema";
import { WORKSPACE_RUNTIME_MAX_ACTIONS, type WorkspaceJson, type WorkspaceModelProposal } from "./contracts";

function isRecord(value: unknown): value is WorkspaceJson {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseWorkspaceModelProposal(answer: string, board?: WorkspaceJson): WorkspaceModelProposal {
  let parsed: unknown;
  try {
    const withoutReasoning = answer.trim().replace(/^(?:<think>[\s\S]*?<\/think>\s*)+/i, "");
    parsed = JSON.parse(withoutReasoning);
  } catch {
    throw new Error("Dify model_step did not return valid JSON.");
  }
  if (!isRecord(parsed) || !Object.keys(parsed).every((key) => ["actions", "done", "message"].includes(key))) {
    throw new Error("Dify model_step returned an invalid proposal object.");
  }
  if (typeof parsed.done !== "boolean" || typeof parsed.message !== "string" || parsed.message.length > 4000 || !Array.isArray(parsed.actions)) {
    throw new Error("Dify model_step proposal requires done, message and actions fields.");
  }
  if (parsed.actions.length > WORKSPACE_RUNTIME_MAX_ACTIONS) throw new Error("Dify model_step exceeded the action limit.");
  const actions = parsed.actions.filter(isRecord);
  if (actions.length !== parsed.actions.length) throw new Error("Dify model_step actions must be JSON objects.");
  for (const action of actions) {
    const issue = validateWorkspaceRuntimeAction(action);
    if (issue) throw new Error(issue);
    const targetIssue = board ? validateWorkspaceRuntimeTableTarget(action, board) : null;
    if (targetIssue) throw new Error(targetIssue);
  }
  if (actions.length > 1 && actions.some((action) => action.type === "undo" || action.type === "redo")) {
    throw new Error("Undo and redo must be the only action in a proposal.");
  }
  if (!parsed.done && actions.length === 0) throw new Error("Dify model_step must finish or propose an action.");
  return { done: parsed.done, message: parsed.message, actions };
}
