"use client";

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useMessageStore } from "@/stores/useMessageStore";
import { getSelectedAIModelName } from "@/lib/selected-ai-model";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { WorkspaceActiveRequest, WorkspaceAttachedFile, WorkspaceChatMessage, WorkspaceQueuedSend } from "../types/chat";
import { inspectWorkspaceChatActionAnswer, type WorkspaceChatActionResult } from "../utils/workspaceChatActions";
import { fetchWorkspaceKnowledgeContext, shouldFetchKnowledgeContext } from "../utils/workspaceKnowledgeContext";
import { flushWorkspacePendingSave } from "../utils/workspacePersistenceFlush";
import { canonicalDeepEqual } from "../utils/canonicalEqual";
import { deriveBoardChangeFeedback, hasUnpersistedMutationClaim, isStructuredDifyAnswer, parseDifyAgentAnswer } from "../utils/workspaceDifyAgentResponse";
import { fetchRemoteBoard } from "./workspaceBoardApi";
import { adoptBoardSnapshot, applyWorkspaceActionsRemotely, fetchBoardAfterAgent } from "./workspaceChatSendHelpers";
import { computeAssistantTurnResult } from "./workspaceChatTurnResult";
import { verifyWorkspaceExportAnswer } from "../utils/workspaceExportAnswer";
import { fetchBoardCommentSnapshot, countCommentChanges } from "../utils/workspaceCommentCount";
import { buildWorkspaceSendPrompt } from "./workspaceChatDifySend";
import { workspaceRuntimeProgressText } from "../utils/workspaceRuntimeProgressCopy";
import {
  beginWorkspaceVersionSnapshotCheck,
  verifyWorkspaceVersionSnapshot,
  versionSnapshotAppliedSummary,
} from "./workspaceVersionPersistence";

import { difyWorkspaceAgentProvider, isWorkspaceRuntimePilot } from "./workspaceChatTransport";

class WorkspaceBoardNotPersistedError extends Error {
  constructor(boardId: string) {
    super(`Board ${boardId} could not be confirmed persisted before this AI turn`);
    this.name = "WorkspaceBoardNotPersistedError";
  }
}

type WorkspaceChatSendOptions = {
  setMessages: Dispatch<SetStateAction<WorkspaceChatMessage[]>>;
  setIsSending: Dispatch<SetStateAction<boolean>>;
  setActiveRequest: Dispatch<SetStateAction<WorkspaceActiveRequest | null>>;
  setQueue: Dispatch<SetStateAction<WorkspaceQueuedSend[]>>;
  messagesRef: MutableRefObject<WorkspaceChatMessage[]>;
  conversationIdRef: MutableRefObject<string | null>;
  upsertSession: (conversationId: string, title: string, messages?: WorkspaceChatMessage[]) => Promise<unknown>;
};

export function useWorkspaceChatSend({
  setMessages,
  setIsSending,
  setActiveRequest,
  setQueue,
  messagesRef,
  conversationIdRef,
  upsertSession,
}: WorkspaceChatSendOptions) {
  const executeSendRef = useRef<((query: string, opts?: { attachedFiles?: WorkspaceAttachedFile[]; contextPrompt?: string }) => Promise<void>) | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; activeControllerRef.current?.abort(); }; }, []);
  const executeSend = useCallback(async (query: string, opts?: { attachedFiles?: WorkspaceAttachedFile[]; contextPrompt?: string }) => {
    if (!mountedRef.current) return;
    const trimmed = query.trim();
    const files = opts?.attachedFiles ?? [];
    if (!trimmed && files.length === 0) return;

    const userDisplayContent = trimmed || `Analyzed ${files.length} attached file(s): ${files.map((f) => f.name).join(", ")}`;
    const selectionPrompt = opts?.contextPrompt ?? "";
    const assistantId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_ws_ai`;
    const previousMessages = [...messagesRef.current];
    setMessages((prev) => [
      ...prev,
      {
        id: `${assistantId}_user`,
        role: "user",
        content: userDisplayContent,
        attachments: files.length > 0 ? files : undefined,
      },
      { id: assistantId, role: "assistant", content: "", isLoading: true },
    ]);
    setIsSending(true);

    const controller = new AbortController();
    activeControllerRef.current = controller;
    const runtime = isWorkspaceRuntimePilot() && files.length === 0;
    let lastProgressSequence = 0;
    const turnId = crypto.randomUUID();
    setActiveRequest({ assistantId, controller, taskId: null, ...(runtime ? { turnId } : {}) });
    const reportTaskId = (taskId: string) => {
      setActiveRequest((cur) => (cur?.assistantId === assistantId ? { ...cur, taskId } : cur));
    };
    const filesPayload = files
      .filter((f) => f.status === "done" && f.id)
      .map((f) => ({
        type: f.type.startsWith("image/") ? "image" : "document",
        transfer_method: "local_file",
        url: "",
        upload_file_id: f.id,
      }));
    const selectedModel = useMessageStore.getState().selectedModel;
    const boardId = useWorkspaceStore.getState().boardId;

    let boardBefore: Awaited<ReturnType<typeof fetchRemoteBoard>> = null;
    try {
      const didFlush = boardId ? await flushWorkspacePendingSave(boardId) : true;
      const localBlocksBefore = structuredClone(useWorkspaceStore.getState().blocks);
      const localConnectorsBefore = structuredClone(useWorkspaceStore.getState().connectors);
      const commentsBefore = boardId ? await fetchBoardCommentSnapshot(boardId) : null;
      if (boardId) {
        boardBefore = await fetchRemoteBoard(boardId);
        if (!didFlush) {
          const localState = useWorkspaceStore.getState();
          const matchesLocalSnapshot = boardBefore !== null
            && canonicalDeepEqual(boardBefore.blocks, localState.blocks)
            && canonicalDeepEqual(boardBefore.blockOrder, localState.blockOrder)
            && canonicalDeepEqual(boardBefore.connectors, localState.connectors);
          if (!matchesLocalSnapshot) throw new WorkspaceBoardNotPersistedError(boardId);
        }
      }
      const versionSnapshotCheck = boardId
        ? await beginWorkspaceVersionSnapshotCheck(
            boardId,
            userDisplayContent,
            useWorkspaceStore.getState().currentUserEmail,
          )
        : null;

      const knowledge = boardId && shouldFetchKnowledgeContext(userDisplayContent)
        ? await fetchWorkspaceKnowledgeContext(boardId, userDisplayContent)
        : null;
      const promptToSend = buildWorkspaceSendPrompt({
        userDisplayContent,
        selectionPrompt,
        knowledgeText: knowledge?.text,
      });
      const { fullText, conversationId, invalidActionResponse } = await difyWorkspaceAgentProvider.send({
        turnId,
        runtime,
        context: [selectionPrompt, knowledge?.text].filter(Boolean).join("\n\n"),
        boardId,
        modelIdentifier: selectedModel?.id || selectedModel?.name || getSelectedAIModelName(),
        promptToSend,
        user: useWorkspaceStore.getState().currentUserEmail,
        filesPayload,
        conversationId: conversationIdRef.current,
        userDisplayContent,
        signal: controller.signal,
        onTaskId: reportTaskId,
        ...(runtime ? {
          onProgress: (event: import("../utils/workspaceChatStream").WorkspaceRuntimeProgressEvent) => {
            if (!mountedRef.current || controller.signal.aborted || event.sequence <= lastProgressSequence) return;
            lastProgressSequence = event.sequence;
            if (event.phase === "persisted" && !(event.persistedCount && event.persistedCount > 0)) return;
            const status = workspaceRuntimeProgressText(event, userDisplayContent);
            setMessages((previous) => previous.map((message) =>
              message.id === assistantId && message.isLoading
                ? { ...message, runtimeProgressText: status }
                : message,
            ));
          },
        } : {}),
      });
      if (conversationId && (!conversationIdRef.current || runtime)) {
        conversationIdRef.current = conversationId;
        void upsertSession(conversationId, userDisplayContent);
      }

      const parsedDifyAnswer = await verifyWorkspaceExportAnswer(parseDifyAgentAnswer(fullText), userDisplayContent, boardId);
      const waitOptions = { expectChange: hasUnpersistedMutationClaim(parsedDifyAnswer, userDisplayContent, false) };
      const isStructuredDifyResponse = isStructuredDifyAnswer(fullText);
      const parsedActionPayload = inspectWorkspaceChatActionAnswer(fullText);
      const actionSpecs = parsedActionPayload.actions;
      let verifiedActionResult: WorkspaceChatActionResult | null = null;
      let boardAfter: Awaited<ReturnType<typeof fetchRemoteBoard>> = null;
      if (fullText && !isStructuredDifyResponse && !invalidActionResponse && actionSpecs.length > 0) {
        boardAfter = await fetchBoardAfterAgent(boardId, boardBefore, waitOptions);
        const actionsAlreadyPersisted = deriveBoardChangeFeedback(boardBefore, boardAfter).appliedSummaries.length > 0;
        const remoteResult = actionsAlreadyPersisted
          ? { ok: true }
          : boardId && typeof boardBefore?.revision === "number"
            ? await applyWorkspaceActionsRemotely(boardId, boardBefore.revision, actionSpecs.map((action) => action.raw))
            : { ok: false, error: "Board revision is unavailable." };
        if (!actionsAlreadyPersisted) {
          verifiedActionResult = {
            displayContent: remoteResult.ok
              ? parsedActionPayload.message || "Workspace action was applied on the server."
              : `The canvas update could not be confirmed as saved. ${remoteResult.error ?? "Please try again."}`,
            appliedBlockIds: [],
            appliedActionCount: remoteResult.ok ? actionSpecs.length : 0,
          };
        }
      }
      boardAfter ??= await fetchBoardAfterAgent(boardId, boardBefore, waitOptions);
      if (boardAfter) adoptBoardSnapshot(boardAfter);
      const createdVersionSnapshot = boardId
        ? await verifyWorkspaceVersionSnapshot(boardId, versionSnapshotCheck)
        : null;
      const versionSnapshotReceipt = createdVersionSnapshot
        ? versionSnapshotAppliedSummary(createdVersionSnapshot, userDisplayContent)
        : null;
      const commentsAfter = boardId && commentsBefore !== null ? await fetchBoardCommentSnapshot(boardId) : null;
      const commentsChanged = countCommentChanges(commentsBefore, commentsAfter);
      if (commentsAfter && useWorkspaceStore.getState().boardId === boardId) useWorkspaceStore.getState().setComments(commentsAfter);
      const turn = computeAssistantTurnResult({
        commentsChanged,
        boardBefore,
        boardAfter,
        localBlocksBefore,
        localBlocksAfter: useWorkspaceStore.getState().blocks,
        localConnectorsBefore,
        localConnectorsAfter: useWorkspaceStore.getState().connectors,
        parsedDifyAnswer,
        userRequest: userDisplayContent,
        actionResult: verifiedActionResult,
        invalidActionResponse,
        knowledgeReferences: knowledge?.references,
        persistedSideEffect: Boolean(createdVersionSnapshot),
        sideEffectAppliedSummaries: versionSnapshotReceipt ? [versionSnapshotReceipt] : [],
      });
      if (runtime && !turn.claimedMutationWithoutPersistence) {
        turn.content = versionSnapshotReceipt && parsedDifyAnswer.content.includes(versionSnapshotReceipt)
          ? parsedDifyAnswer.content
          : [parsedDifyAnswer.content, versionSnapshotReceipt].filter(Boolean).join("\n\n");
      }
      const verifiedRecordIds = runtime && !turn.claimedMutationWithoutPersistence
        ? parsedDifyAnswer.verifiedRecordIds
        : undefined;
      setMessages((prev) => prev.map((message) => message.id === assistantId
        ? {
            ...message,
            content: turn.content,
            isLoading: false,
            suggestions: turn.claimedMutationWithoutPersistence
              ? { grounded: ["Check the canvas after the assistant reports an update"], expand: ["Try a more specific request"] }
              : turn.suggestions,
            focusBlockIds: turn.focusBlockIds,
            appliedSummaries: turn.appliedSummaries,
            unresolvedSummaries: turn.unresolvedSummaries,
            ...(verifiedRecordIds?.length ? { verifiedRecordIds } : {}),
            references: turn.references,
          }
        : message));
      if (conversationId) {
        const savedMessages: WorkspaceChatMessage[] = [
          ...previousMessages,
          { role: "user", content: userDisplayContent, attachments: files.length > 0 ? files : undefined },
          {
            role: "assistant",
            content: turn.content,
            suggestions: turn.suggestions,
            focusBlockIds: turn.focusBlockIds,
            appliedSummaries: turn.appliedSummaries,
            unresolvedSummaries: turn.unresolvedSummaries,
            ...(verifiedRecordIds?.length ? { verifiedRecordIds } : {}),
            references: turn.references,
          },
        ];
        void upsertSession(conversationId, userDisplayContent, savedMessages);
      }
    } catch (err) {
      const isAbort = (err as { name?: string })?.name === "AbortError";
      const isUnpersisted = err instanceof WorkspaceBoardNotPersistedError;
      // A long turn (e.g. web research) can outlive the connection while the
      // server still finishes and saves the edit; report that instead of a failure.
      const recovered = !isAbort && !isUnpersisted && boardBefore
        ? await fetchBoardAfterAgent(boardId, boardBefore, { expectChange: true }).catch(() => null)
        : null;
      const recoveredSummaries = recovered ? deriveBoardChangeFeedback(boardBefore, recovered).appliedSummaries : [];
      if (recovered && recoveredSummaries.length > 0) {
        adoptBoardSnapshot(recovered);
        setMessages((prev) => prev.map((message) => message.id === assistantId
          ? {
              ...message,
              content: "The connection dropped before the assistant finished its reply, but your board was updated.",
              appliedSummaries: recoveredSummaries,
              isLoading: false,
            }
          : message));
      } else if (!isAbort) {
        if (!isUnpersisted) console.error("[workspace chat] send failed:", err);
        const reason = err instanceof Error && err.message ? ` (${err.message.slice(0, 120)})` : "";
        setMessages((prev) => prev.map((message) => message.id === assistantId
          ? {
              ...message,
              content: isUnpersisted
                ? "Couldn't confirm your latest canvas changes were saved before asking the AI, so this request was not sent. Please try again in a moment."
                : `Something went wrong reaching the assistant${reason}. Please try again.`,
              isLoading: false,
              error: true,
            }
          : message));
      }
    } finally {
      setIsSending(false);
      setActiveRequest((current) => (current?.assistantId === assistantId ? null : current));
      setQueue((previous) => {
        if (previous.length === 0) return previous;
        const [next, ...rest] = previous;
        setTimeout(() => {
          if (mountedRef.current) void executeSendRef.current?.(next.query, next.opts);
        }, 0);
        return rest;
      });
    }
  }, [conversationIdRef, messagesRef, setActiveRequest, setIsSending, setMessages, setQueue, upsertSession]);
  executeSendRef.current = executeSend;
  return executeSend;
}
