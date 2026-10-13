import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { runWorkspaceHistoryAction } from "./workspaceHistoryBridge";

export const WORKSPACE_HISTORY_ACTION_ID = "__workspace_history_action__";

export function applyWorkspaceHistoryAction(raw: Record<string, unknown>): string[] {
  const type = String(raw.type ?? "").toLowerCase();
  if (type !== "undo" && type !== "redo") return [];
  return runWorkspaceHistoryAction(type) ? [WORKSPACE_HISTORY_ACTION_ID] : [];
}

export function selectedWorkspaceIds(): string[] {
  const state = useWorkspaceStore.getState();
  return state.selectedBlockIds.filter((id) => Boolean(state.blocks[id]));
}
