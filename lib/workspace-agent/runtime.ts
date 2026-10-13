import {
  WORKSPACE_RUNTIME_MAX_ACTIONS,
  WORKSPACE_RUNTIME_MAX_ROUNDS,
  type WorkspaceBoardSnapshot,
  type WorkspaceJson,
  type WorkspaceModelProposalRequest,
  type WorkspaceRuntimeReceipt,
  type WorkspaceRuntimeRequest,
  type WorkspaceRuntimeResult,
  type WorkspaceTurnProgressInput,
} from "./contracts";
import { buildModelStepQuery } from "./modelStepContext";
import { suppressWorkspaceActionReplays, workspaceActionReplayKey } from "./actionReplayGuard";
import { limitImageFlowCreations, requestedImageFlowCount } from "./imageFlowTurnPolicy";
import { bindConfirmedWorkspaceDefaults, compactWorkspaceReadResult, summarizeConfirmationRequest, workspaceActionNeedsConfirmation, WORKSPACE_READ_ONLY_COMMANDS } from "./runtimeSafety";
import { createDifyModelProvider } from "./difyModelProvider";
import { parseWorkspaceModelProposal } from "./proposalValidation";
import { executeWorkspaceActions, readWorkspaceSnapshot, type WorkspaceExecutorResult } from "./workspaceExecutor";
import { workspaceActionReceiptSummary } from "./receiptSummaries";
import { partialAnswer } from "./partialAnswer";
import { completedWorkspaceAnswer, verifiedCollectionRecordIds } from "./runtimeReadAnswer";
import { hasPlainMutationClaim, isCanvasMutationRequest } from "@/app/workspace/utils/workspaceDifyAgentResponse";
import { getWorkspaceResponseLanguageInstruction } from "@/app/workspace/utils/workspaceChatRequest";

export interface WorkspaceRuntimeDependencies {
  readSnapshot(input: WorkspaceRuntimeRequest): Promise<WorkspaceBoardSnapshot>;
  execute(input: WorkspaceRuntimeRequest, turnId: string, round: number, revision: number, actions: WorkspaceJson[]): Promise<WorkspaceExecutorResult>;
  modelProvider: { propose(input: WorkspaceModelProposalRequest): Promise<{ answer: string; conversationId: string | null }> };
  isCancelled?(): Promise<boolean>;
  onProgress?(event: WorkspaceTurnProgressInput): Promise<unknown>;
}
function record(value: unknown): WorkspaceJson {
  return value && typeof value === "object" && !Array.isArray(value) ? value as WorkspaceJson : {};
}
function changedActionResults(body: WorkspaceJson): WorkspaceJson[] {
  return Array.isArray(body.actions) ? body.actions.map(record) : [];
}
function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("Workspace runtime was cancelled."));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new Error("Workspace runtime was cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}
const NON_BLOCK_TARGET_ACTIONS = new Set([
  "list_versions", "create_version", "restore_version", "export_board", "import_markdown",
  "list_shares", "share_board", "remove_share", "set_public_link",
]);
function result(
  input: WorkspaceRuntimeRequest,
  conversationId: string | null,
  rounds: number,
  status: WorkspaceRuntimeResult["status"],
  answer: string,
  receipts: WorkspaceRuntimeReceipt[],
  unresolvedSummaries: string[],
  readResults: WorkspaceJson[],
): WorkspaceRuntimeResult {
  const appliedSummaries = receipts.filter((item) => item.persisted && item.summary).map((item) => item.summary!);
  const focusBlockIds = [...new Set(receipts.filter((item) => item.persisted && !NON_BLOCK_TARGET_ACTIONS.has(item.actionType)).flatMap((item) => item.targetIds).filter((id) => id !== "board"))];
  return { answer, turnId: input.turnId, conversationId, rounds, status, receipts, appliedSummaries, unresolvedSummaries, focusBlockIds, verifiedRecordIds: verifiedCollectionRecordIds(readResults) };
}
export async function runWorkspaceAgentTurn(
  input: WorkspaceRuntimeRequest,
  dependencies: Partial<WorkspaceRuntimeDependencies> = {},
): Promise<WorkspaceRuntimeResult> {
  const modelProvider = dependencies.modelProvider ?? createDifyModelProvider();
  const readSnapshot = dependencies.readSnapshot ?? readWorkspaceSnapshot;
  const execute = dependencies.execute ?? executeWorkspaceActions;
  const receipts: WorkspaceRuntimeReceipt[] = [];
  const confirmedReplayKeys = new Set<string>();
  const readResults: WorkspaceJson[] = [];
  const unresolved: string[] = [];
  let conversationId: string | null = input.conversationId ?? null;
  let rounds = 0;
  let totalActions = 0;
  let phase = "snapshot";
  const startedAt = Date.now();
  const ensureActive = async () => {
    if (input.signal.aborted || await dependencies.isCancelled?.()) throw new Error("Workspace runtime was cancelled.");
  };
  const reportProgress = async (event: WorkspaceTurnProgressInput) => {
    try {
      await dependencies.onProgress?.(event);
    } catch {
      console.error("[workspace-agent-progress]", {
        boardId: input.boardId,
        turnId: input.turnId,
        phase: event.phase,
        errorCode: "progress_store_failed",
      });
    }
  };
  try {
    for (let round = 1; round <= WORKSPACE_RUNTIME_MAX_ROUNDS; round += 1) {
      await ensureActive();
      phase = "snapshot";
      const snapshot = await awaitWithAbort(readSnapshot(input), input.signal);
      rounds = round;
      await ensureActive();
      phase = "model_step";
      await reportProgress({ phase: "model_step", round });
      await ensureActive();
      const proposed = await modelProvider.propose({
        boardId: input.boardId,
        turnId: input.turnId,
        round,
        modelSelector: input.modelSelector,
        workspaceUserToken: input.workspaceUserToken,
        ...(input.actorEmail ? { actorEmail: input.actorEmail } : {}),
        query: buildModelStepQuery(input, snapshot, receipts, readResults),
        conversationId,
        signal: input.signal,
      });
      await ensureActive();
      conversationId = proposed.conversationId ?? conversationId;
      phase = "proposal_validation";
      const proposal = parseWorkspaceModelProposal(proposed.answer, snapshot);
      const replayGuard = suppressWorkspaceActionReplays(proposal.actions, confirmedReplayKeys);
      const priorImageFlowCreations = receipts.filter((receipt) => receipt.persisted && receipt.actionType === "create_image_flow").length;
      const imageFlowGuard = limitImageFlowCreations(
        replayGuard.actions,
        requestedImageFlowCount(input.query) - priorImageFlowCreations,
      );
      const actionsToExecute = imageFlowGuard.actions;
      if (proposal.actions.length > 0 && actionsToExecute.length === 0 && replayGuard.suppressed + imageFlowGuard.suppressed > 0) {
        const status = unresolved.length ? "partial" : "completed";
        const answer = status === "completed"
          ? completedWorkspaceAnswer(receipts, "Workspace changes were saved.", input.query, readResults)
          : partialAnswer(receipts.filter((item) => item.persisted).length, input.query, receipts);
        return result(input, conversationId, rounds, status, answer, receipts, unresolved, readResults);
      }
      if (proposal.actions.length === 0) {
        if (unresolved.length) return result(input, conversationId, rounds, "partial", partialAnswer(receipts.filter((item) => item.persisted).length, input.query, receipts), receipts, unresolved, readResults);
        if (receipts.some((item) => item.persisted) || readResults.some((item) => ["read_collection", "search_collection_records"].includes(String(item.actionType)))) {
          return result(input, conversationId, rounds, "completed", completedWorkspaceAnswer(receipts, "Workspace changes were saved.", input.query, readResults), receipts, unresolved, readResults);
        }
        if (isCanvasMutationRequest(input.query) && hasPlainMutationClaim(proposal.message)) {
          unresolved.push("The model reported a change without a persisted action receipt.");
          return result(input, conversationId, rounds, "partial", partialAnswer(0, input.query, receipts), receipts, unresolved, readResults);
        }
        return result(input, conversationId, rounds, "completed", proposal.message || "Done.", receipts, unresolved, readResults);
      }
      totalActions += actionsToExecute.length;
      if (totalActions > WORKSPACE_RUNTIME_MAX_ACTIONS) throw new Error("Workspace runtime action limit reached.");
      if (!input.canMutate) {
        const readsOnly = proposal.actions.every((action) => WORKSPACE_READ_ONLY_COMMANDS.has(String(action.type)));
        if (!readsOnly) {
          unresolved.push("This user can view the board but does not have permission to change it.");
          return result(input, conversationId, rounds, "partial", partialAnswer(0, input.query, receipts), receipts, unresolved, readResults);
        }
      }
      const unconfirmed = actionsToExecute.filter((action) => workspaceActionNeedsConfirmation(action, input.query, input.context ?? ""));
      if (unconfirmed.length) {
        return result(input, conversationId, rounds, "completed", summarizeConfirmationRequest(unconfirmed, input.query), receipts, unresolved, readResults);
      }
      const groups: WorkspaceJson[][] = [];
      for (const action of actionsToExecute) {
        const previous = groups[groups.length - 1];
        const read = WORKSPACE_READ_ONLY_COMMANDS.has(String(action.type));
        if (!previous || WORKSPACE_READ_ONLY_COMMANDS.has(String(previous[0].type)) !== read) groups.push([action]);
        else previous.push(action);
      }
      let currentRevision = snapshot.revision;
      const persistedBeforeRound = receipts.filter((item) => item.persisted).length;
      let actions: WorkspaceJson[] = [];
      let committed = true;
      for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        await ensureActive();
        phase = "executor";
        await reportProgress({ phase: "executing", round });
        // Progress persistence can yield; never execute after durable cancellation.
        await ensureActive();
        const group = groups[groupIndex];
        // Preserve the existing single-phase receipt contract (turnId:round).
        // Extra read/write phases have separate deterministic replay keys.
        const requestRound = groupIndex === 0 ? round : round * 100 + groupIndex;
        const execution = await execute(input, input.turnId, requestRound, currentRevision, group.map(bindConfirmedWorkspaceDefaults));
        committed = execution.httpStatus >= 200 && execution.httpStatus < 300 && execution.body.success === true;
        const revisionAfter = Number.isInteger(execution.body.revision) ? Number(execution.body.revision) : null;
        const groupResults = changedActionResults(execution.body);
        actions.push(...groupResults);
        group.forEach((action, index) => {
          const actionType = String(action.type) as WorkspaceRuntimeReceipt["actionType"];
          const actionResult = groupResults[index] ?? {};
          const readOnly = WORKSPACE_READ_ONLY_COMMANDS.has(actionType);
          const changed = committed && actionResult.changed === true;
          const replayKey = changed ? workspaceActionReplayKey(action) : null;
          if (replayKey) confirmedReplayKeys.add(replayKey);
          const executedRead = committed && readOnly && actionResult.changed === false;
          const resultIds = Array.isArray(actionResult.ids)
            ? actionResult.ids.filter((id): id is string => typeof id === "string" && id.length > 0)
            : typeof action.blockId === "string" ? [action.blockId] : [];
          const targetIds = changed ? resultIds : [];
          const receiptLanguage = getWorkspaceResponseLanguageInstruction(input.query) === "Vietnamese" ? "Vietnamese" : "English";
          const summary = workspaceActionReceiptSummary({ actionType, action, actionResult, language: receiptLanguage, targetIds, snapshot, body: execution.body, changed });
          if (executedRead) {
            const collectionReads = record(execution.body.result).collections;
            const readValue = Array.isArray(collectionReads) ? collectionReads[index] : execution.body.result;
            readResults.push({
              ...compactWorkspaceReadResult(actionType, readValue),
              ...(typeof action.query === "string" ? { query: action.query } : {}),
              ...(typeof action.blockId === "string" ? { blockId: action.blockId } : {}),
            });
          }
          const reason = changed || executedRead ? undefined : String(actionResult.reason ?? execution.body.error ?? "The executor did not confirm this action.");
          receipts.push({
            requestId: `${input.turnId}:${requestRound}`,
            actionType, targetIds, persisted: changed,
            revisionBefore: currentRevision,
            revisionAfter: changed ? revisionAfter : null,
            ...(summary ? { summary: `${actionType}: ${summary}` } : {}),
            ...(!changed && reason ? { reason } : {}),
          });
          if (!changed && !executedRead) unresolved.push(`${actionType}: ${reason}`);
        });
        if (!committed || groupResults.some((entry) => entry.changed !== true && !WORKSPACE_READ_ONLY_COMMANDS.has(String(entry.type)))) {
          const remaining = groups.slice(groupIndex + 1).flat();
          for (const pending of remaining) {
            const actionType = String(pending.type);
            const reason = "Not run because an earlier action group failed.";
            unresolved.push(`${actionType}: ${reason}`);
            receipts.push({ requestId: `${input.turnId}:${round * 100 + groupIndex + 1}`, actionType, targetIds: [], persisted: false, revisionBefore: currentRevision, revisionAfter: null, reason });
          }
          break;
        }
        if (revisionAfter !== null) currentRevision = revisionAfter;
      }
      const persistedCount = receipts.filter((item) => item.persisted).length;
      if (persistedCount > persistedBeforeRound) {
        const confirmed = receipts.filter((item) => item.persisted);
        const latestRevision = confirmed[confirmed.length - 1]?.revisionAfter;
        await reportProgress({
          phase: "persisted",
          round,
          persistedCount,
          ...(typeof latestRevision === "number" ? { revision: latestRevision } : {}),
        });
      }
      await ensureActive();
      if (!committed) {
        if (unresolved.length === 0) unresolved.push("The executor did not confirm that the batch was saved.");
        return result(input, conversationId, rounds, "partial", partialAnswer(receipts.filter((item) => item.persisted).length, input.query, receipts), receipts, unresolved, readResults);
      }
      const historyTransition = actionsToExecute.some((action) => action.type === "undo" || action.type === "redo");
      if (proposal.done || historyTransition) {
        if (actions.some((action) => WORKSPACE_READ_ONLY_COMMANDS.has(String(action.type)))) {
          const hasCollectionRead = actions.some((action) => ["read_collection", "search_collection_records"].includes(String(action.type)));
          if (!hasCollectionRead && round < WORKSPACE_RUNTIME_MAX_ROUNDS) continue;
          const status = unresolved.length ? "partial" : "completed";
          const answer = status === "completed"
            ? hasCollectionRead ? completedWorkspaceAnswer(receipts, proposal.message, input.query, readResults) : JSON.stringify(readResults).slice(0, 8000)
            : partialAnswer(receipts.filter((item) => item.persisted).length, input.query, receipts);
          return result(input, conversationId, rounds, status, answer, receipts, unresolved, readResults);
        }
        const status = unresolved.length ? "partial" : "completed";
        return result(input, conversationId, rounds, status, status === "completed" ? completedWorkspaceAnswer(receipts, proposal.message, input.query, readResults) : partialAnswer(receipts.filter((item) => item.persisted).length, input.query, receipts), receipts, unresolved, readResults);
      }
    }
    unresolved.push("The runtime reached its round limit before confirming the full request.");
    return result(input, conversationId, rounds, "partial", partialAnswer(receipts.filter((item) => item.persisted).length, input.query, receipts), receipts, unresolved, readResults);
  } catch (error) {
    const cancelled = input.signal.aborted || (error instanceof Error && error.message === "Workspace runtime was cancelled.");
    const safeErrorMessage = error instanceof Error ? error.message : "";
    const upstreamStatus = safeErrorMessage.match(/\((\d{3})\)/)?.[1];
    const providerFailureKind = safeErrorMessage.startsWith("Dify model-step preflight failed")
      ? "dify_preflight_http"
      : safeErrorMessage.startsWith("Dify model_step failed")
        ? "dify_model_http"
        : safeErrorMessage === "Dify model_step returned no answer."
          ? "dify_missing_answer"
          : error instanceof TypeError
            ? "network_or_parse_error"
            : "provider_error";
    console.error("[workspace-agent-runtime]", {
      boardId: input.boardId,
      turnId: input.turnId,
      phase,
      status: cancelled ? "cancelled" : "failed",
      errorCode: cancelled ? "turn_cancelled" : `${phase}_failed`,
      providerFailureKind: cancelled ? undefined : providerFailureKind,
      upstreamStatusCode: cancelled || !upstreamStatus ? undefined : Number(upstreamStatus),
      latencyMs: Date.now() - startedAt,
    });
    unresolved.push(cancelled
      ? "The turn was cancelled; no further actions were run. Check confirmed receipts before retrying."
      : "The turn stopped before all proposed work could be confirmed. Check the board before retrying.");
    const status = cancelled || receipts.some((item) => item.persisted) ? "partial" : "failed";
    return result(input, conversationId, rounds, status, partialAnswer(receipts.filter((item) => item.persisted).length, input.query, receipts), receipts, unresolved, readResults);
  }
}