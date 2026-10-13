import { applyAgentViewFocus, readAgentViewFocus } from "../utils/workspaceAgentViewFocus";
import { fetchRemoteBoard, rememberRevision, type RemoteBoard } from "./workspaceBoardApi";
import { WORKSPACE_CHAT_CATEGORY } from "../utils/workspaceChatRequest";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

const BOARD_SYNC_RETRIES = 6;
const BOARD_SYNC_DELAY_MS = 350;
// A reply that claims a board change may still have its tool write in flight,
// so wait longer before deciding nothing persisted; Q&A turns keep the short wait.
const PATIENT_BOARD_SYNC_RETRIES = 30;
const PATIENT_BOARD_SYNC_DELAY_MS = 500;

function waitForBoardSync(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

/** Dify mutates the board from a separate server request. Wait for that
 * request to become visible before building the same Focus/action affordance
 * that the native DeepSeek tool loop gets synchronously. */
export async function fetchBoardAfterAgent(
  boardId: string | null,
  before: Awaited<ReturnType<typeof fetchRemoteBoard>>,
  options: { expectChange?: boolean } = {},
) {
  let latest = boardId ? await fetchRemoteBoard(boardId) : null;
  if (!boardId || !before || !latest) return latest;
  const retries = options.expectChange ? PATIENT_BOARD_SYNC_RETRIES : BOARD_SYNC_RETRIES;
  const delayMs = options.expectChange ? PATIENT_BOARD_SYNC_DELAY_MS : BOARD_SYNC_DELAY_MS;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (
      typeof before.revision === "number" &&
      typeof latest.revision === "number" &&
      latest.revision !== before.revision
    ) return latest;
    await waitForBoardSync(delayMs);
    latest = await fetchRemoteBoard(boardId);
    if (!latest) return null;
  }
  return latest;
}

/** Calls Dify's stop-task endpoint so an aborted request also stops running
 *  on the provider's side, not just on our own connection to it. */
export async function stopDifyTask(taskId: string, user: string | null): Promise<void> {
  try {
    await fetch("/api/chat/messages/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId, user, category: WORKSPACE_CHAT_CATEGORY }),
    });
  } catch (err) {
    console.error("Error stopping Dify task:", err);
  }
}

/** A live workspace deliberately bypasses REST autosave. Every AI action
 *  envelope must therefore enter through the authoritative mutation route;
 *  applying it only to Zustand would be lost on the next server refresh. */
export async function applyWorkspaceActionsRemotely(
  boardId: string,
  baseRevision: number,
  actions: Record<string, unknown>[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(boardId)}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRevision,
        actions,
        editOperation: `ai.${actions[0]?.type ?? "batch"}`,
      }),
    });
    const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
    return response.ok && result.success === true
      ? { ok: true }
      : { ok: false, error: result.error ?? `Workspace action failed (${response.status})` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Workspace action request failed" };
  }
}

/** Re-adopts the complete post-turn server snapshot into the board store.
 *  The local action parser can optimistically update Zustand before the
 *  Dify tool has actually persisted anything, so this must run after the
 *  turn to correct any snapshot the tool call didn't actually save — and it
 *  must call `rememberRevision` (not a bare Zustand write) or the next
 *  autosave still carries the pre-mutation baseRevision and gets refused
 *  with a 409 the instant this adoption marks the store "changed". */
export function adoptBoardSnapshot(boardAfter: RemoteBoard): void {
  rememberRevision(boardAfter);
  const previousCamera = useWorkspaceStore.getState().camera;
  const previousFocus = readAgentViewFocus(previousCamera);
  const nextFocus = readAgentViewFocus(boardAfter.camera);
  useWorkspaceStore.setState({
    blocks: boardAfter.blocks as never,
    blockOrder: boardAfter.blockOrder as never,
    connectors: boardAfter.connectors as never,
    camera: boardAfter.camera as never,
    frames: boardAfter.frames as never,
    title: boardAfter.title,
    treeLayoutDirection: boardAfter.treeLayoutDirection as never,
    treeGrowthMode: boardAfter.treeGrowthMode as never,
    treeLayoutFamily: boardAfter.treeLayoutFamily as never,
    treeTimelineBranchMode: boardAfter.treeTimelineBranchMode as never,
    treeTimelineDescendantStyle: boardAfter.treeTimelineDescendantStyle as never,
    treeCatalogDescendantStyle: boardAfter.treeCatalogDescendantStyle as never,
  });
  if (nextFocus && nextFocus.seq !== (previousFocus?.seq ?? 0)) applyAgentViewFocus(nextFocus, previousCamera);
}
