import type { RemoteBoard } from "./workspaceBoardApi";
import type { ParsedDifyAgentAnswer } from "../utils/workspaceDifyAgentResponse";
import type { WorkspaceChatActionResult } from "../utils/workspaceChatActions";
import type { WorkspaceChatFollowUpSuggestions } from "../types/chat";
import type { WorkspaceKnowledgeReference } from "../utils/workspaceKnowledgeContext";
import {
  buildNetZeroBoardRevisionNotice,
  deriveBoardChangeFeedback,
  DIFY_MUTATION_NOT_PERSISTED_MESSAGE,
  getNetZeroBoardRevisionAdvance,
  hasUnpersistedMutationClaim,
} from "../utils/workspaceDifyAgentResponse";
import { safeWorkspaceAssistantContent, WORKSPACE_SAFE_FALLBACK } from "../utils/workspaceChatVisibleContent";

export interface AssistantTurnResultInputs {
  boardBefore: RemoteBoard | null;
  boardAfter: RemoteBoard | null;
  localBlocksBefore: Record<string, unknown>;
  localBlocksAfter: Record<string, unknown>;
  localConnectorsBefore: Record<string, unknown>;
  localConnectorsAfter: Record<string, unknown>;
  parsedDifyAnswer: ParsedDifyAgentAnswer;
  userRequest: string;
  actionResult: WorkspaceChatActionResult | null;
  invalidActionResponse: boolean;
  knowledgeReferences?: WorkspaceKnowledgeReference[];
  /** Comments added during the turn. Comments are not board content, so they
   *  never move the board revision, but they are a real, persisted change. */
  commentsAdded?: number;
  commentsChanged?: number;
  persistedSideEffect?: boolean;
  sideEffectAppliedSummaries?: string[];
}

export interface AssistantTurnResult {
  content: string;
  /** The base suggestions (Dify's own, or a generic fallback) — used as-is
   *  for the persisted session history. The live message bubble additionally
   *  overrides this to a claimed-mutation-specific set when
   *  `claimedMutationWithoutPersistence` is true (see the caller). */
  suggestions: WorkspaceChatFollowUpSuggestions;
  focusBlockIds: string[];
  appliedSummaries: string[] | undefined;
  unresolvedSummaries: string[] | undefined;
  references: WorkspaceKnowledgeReference[] | undefined;
  /** Dify claimed it mutated the board, but neither the local action parser
   *  nor the post-turn board snapshot shows any change actually persisted. */
  claimedMutationWithoutPersistence: boolean;
}

/** Reconciles what Dify said happened against what the board actually shows
 *  after the turn (`boardAfter` is authoritative — a claimed mutation the
 *  server never persisted must not be reported as a success), and derives
 *  the single result object used both for the live message bubble and for
 *  the session-history entry saved to Mongo. Kept as a pure function so both
 *  call sites can never drift out of sync with each other. */
export function computeAssistantTurnResult({
  boardBefore,
  boardAfter,
  localBlocksBefore,
  localBlocksAfter,
  localConnectorsBefore,
  localConnectorsAfter,
  parsedDifyAnswer,
  userRequest,
  actionResult,
  invalidActionResponse,
  knowledgeReferences,
  commentsAdded = 0,
  commentsChanged = commentsAdded,
  persistedSideEffect = false,
  sideEffectAppliedSummaries = [],
}: AssistantTurnResultInputs): AssistantTurnResult {
  const boardFeedback = deriveBoardChangeFeedback(boardBefore, boardAfter);
  const changedBlockIds = Object.keys(localBlocksAfter).filter((id) =>
    JSON.stringify(localBlocksBefore[id]) !== JSON.stringify(localBlocksAfter[id]),
  );
  const changedConnectorIds = Object.keys(localConnectorsAfter).filter((id) =>
    JSON.stringify(localConnectorsBefore[id]) !== JSON.stringify(localConnectorsAfter[id]),
  );
  const localWasChanged = changedBlockIds.length > 0 || changedConnectorIds.length > 0;
  const boardWasChanged = boardFeedback.appliedSummaries.length > 0;
  const revisionAdvance = getNetZeroBoardRevisionAdvance(boardBefore, boardAfter);
  const netZeroRevisionAdvance = !boardWasChanged && revisionAdvance
    && hasUnpersistedMutationClaim(parsedDifyAnswer, userRequest, false)
    ? revisionAdvance
    : null;
  const finalAnswerWasFiltered = safeWorkspaceAssistantContent(parsedDifyAnswer.content) === WORKSPACE_SAFE_FALLBACK;
  const reportedUnresolved = Array.from(new Set([
    ...(parsedDifyAnswer.unresolvedSummaries ?? []),
    ...(finalAnswerWasFiltered && boardWasChanged
      ? ["The AI response could not confirm every requested change; review the persisted board before treating the request as complete."]
      : []),
  ]));
  const claimedMutationWithoutPersistence = hasUnpersistedMutationClaim(
    parsedDifyAnswer,
    userRequest,
    boardWasChanged || Boolean(netZeroRevisionAdvance) || commentsChanged > 0 || persistedSideEffect,
  );
  const actualChangedBlockIds = boardFeedback.focusBlockIds.length > 0
    ? boardFeedback.focusBlockIds
    : changedBlockIds;
  const actualAppliedSummaries = boardFeedback.appliedSummaries.length > 0
    ? boardFeedback.appliedSummaries
    : [
        localWasChanged
          ? `Updated ${changedBlockIds.length} block(s)${changedConnectorIds.length ? ` and ${changedConnectorIds.length} connector(s)` : ""}`
          : "",
      ].filter(Boolean);
  // Dify can commit an early tool call and then exhaust its iteration
  // budget before emitting the final JSON envelope. The after-snapshot is
  // authoritative for the actual canvas state, so do not report that
  // nothing changed when a partial mutation really was applied.
  const partialMutationContent = reportedUnresolved.length > 0
    ? `${boardWasChanged ? "Only part of the requested canvas change is confirmed" : "No canvas change is confirmed"}. Unresolved items: ${reportedUnresolved.join("; ")}.`
    : "";
  const finalContent = parsedDifyAnswer.verifiedReadOnlyResult
    ? parsedDifyAnswer.content
    : claimedMutationWithoutPersistence
    ? DIFY_MUTATION_NOT_PERSISTED_MESSAGE
    : netZeroRevisionAdvance
    ? `${safeWorkspaceAssistantContent(parsedDifyAnswer.content)}\n\n${buildNetZeroBoardRevisionNotice(netZeroRevisionAdvance)}`
    : persistedSideEffect && sideEffectAppliedSummaries.length > 0
    ? [parsedDifyAnswer.content, sideEffectAppliedSummaries.join(" ")].filter(Boolean).join("\n\n")
    : partialMutationContent
    ? partialMutationContent
    : invalidActionResponse && boardWasChanged
    ? `The AI applied part of the request to the canvas (${actualAppliedSummaries.join(", ")}). The rest is incomplete because the AI final response was not in the expected action format.`
    : invalidActionResponse
      ? "AI returned an invalid action format, so no canvas changes were applied. Please try again."
      : actionResult?.appliedActionCount && !boardWasChanged && commentsChanged === 0 && !persistedSideEffect
        ? DIFY_MUTATION_NOT_PERSISTED_MESSAGE
        : actionResult?.displayContent || parsedDifyAnswer.content;
  const suggestions: WorkspaceChatFollowUpSuggestions = parsedDifyAnswer.suggestions ?? (
    boardWasChanged
      ? {
          grounded: ["Focus the node that was just updated to see where it sits on the canvas"],
          expand: ["Re-check the branch structure after the action completes"],
        }
      : {
          grounded: ["Check the answer against what is currently on the canvas"],
          expand: ["Search further in the workspace knowledge base"],
        }
  );
  const remoteBlockIds = boardAfter?.blocks && typeof boardAfter.blocks === "object"
    ? new Set(Object.keys(boardAfter.blocks as object))
    : null;
  const validFocusBlockIds = actualChangedBlockIds.filter((id) => !remoteBlockIds || remoteBlockIds.has(id));
  const focusBlockIds = boardWasChanged
    ? (parsedDifyAnswer.focusBlockIds?.length
        ? parsedDifyAnswer.focusBlockIds.filter((id) => !remoteBlockIds || remoteBlockIds.has(id))
        : validFocusBlockIds)
    : [];
  const appliedSummaries = claimedMutationWithoutPersistence || netZeroRevisionAdvance
    ? []
    : boardWasChanged
    ? Array.from(new Set([...(parsedDifyAnswer.appliedSummaries ?? []), ...actualAppliedSummaries]))
    : persistedSideEffect
    ? Array.from(new Set([...(parsedDifyAnswer.appliedSummaries ?? []), ...sideEffectAppliedSummaries]))
    : commentsChanged > 0
    ? parsedDifyAnswer.appliedSummaries?.length ? parsedDifyAnswer.appliedSummaries : [`Updated ${commentsChanged} comment(s)`]
    : parsedDifyAnswer.appliedSummaries;
  const unresolvedSummaries = claimedMutationWithoutPersistence
    ? ["Provider reported a mutation but no persisted board change was observed."]
    : reportedUnresolved.length > 0 ? reportedUnresolved : parsedDifyAnswer.unresolvedSummaries;

  return {
    content: finalContent,
    suggestions,
    focusBlockIds,
    appliedSummaries,
    unresolvedSummaries,
    references: parsedDifyAnswer.references ?? knowledgeReferences,
    claimedMutationWithoutPersistence,
  };
}
