"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceActiveRequest, WorkspaceChatMessage, WorkspaceQueuedSend } from "../types/chat";
import { parseDifyAgentAnswer } from "../utils/workspaceDifyAgentResponse";
import { WORKSPACE_CHAT_CATEGORY } from "../utils/workspaceChatRequest";
import { useWorkspaceChatSessions } from "./useWorkspaceChatSessions";
import { useWorkspaceChatQueue } from "./useWorkspaceChatQueue";
import { useWorkspaceChatSend } from "./useWorkspaceChatSend";

export type { WorkspaceActiveRequest, WorkspaceQueuedSend };

export function useWorkspaceChat() {
  const [messages, setMessages] = useState<WorkspaceChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const messagesRef = useRef<WorkspaceChatMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const [activeRequest, setActiveRequest] = useState<WorkspaceActiveRequest | null>(null);
  const [queue, setQueue] = useState<WorkspaceQueuedSend[]>([]);
  const autoRestoreAttemptedRef = useRef(false);
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    isLoadingSessions,
    loadSessionMessages,
    upsertSession,
  } = useWorkspaceChatSessions(WORKSPACE_CHAT_CATEGORY);
  const executeSend = useWorkspaceChatSend({
    setMessages,
    setIsSending,
    setActiveRequest,
    setQueue,
    messagesRef,
    conversationIdRef,
    upsertSession,
  });

  const startNewConversation = useCallback(() => {
    autoRestoreAttemptedRef.current = true;
    setMessages([]);
    conversationIdRef.current = null;
    setActiveSessionId(null);
  }, [setActiveSessionId]);

  const selectSession = useCallback(async (sessionId: string) => {
    const result = await loadSessionMessages(sessionId);
    if (!result) return;
    setActiveSessionId(sessionId);
    conversationIdRef.current = result.difyConversationId || null;
    setMessages(result.messages.map((message) => {
      if (message.role !== "assistant") return message;
      const parsed = parseDifyAgentAnswer(message.content);
      return {
        ...message,
        content: parsed.content,
        suggestions: parsed.suggestions,
        focusBlockIds: parsed.focusBlockIds,
        appliedSummaries: parsed.appliedSummaries,
        unresolvedSummaries: parsed.unresolvedSummaries,
        references: parsed.references,
      };
    }));
  }, [loadSessionMessages, setActiveSessionId]);

  useEffect(() => {
    if (autoRestoreAttemptedRef.current || isLoadingSessions || activeSessionId || messages.length || sessions.length === 0) return;
    autoRestoreAttemptedRef.current = true;
    void selectSession(sessions[0].id);
  }, [activeSessionId, isLoadingSessions, messages.length, selectSession, sessions]);

  const {
    sendMessage,
    sendMessageNow,
    cancelCurrentRequest,
    editQueuedMessage,
    moveQueuedMessage,
    cancelQueuedMessage,
    sendQueuedMessageNow,
  } = useWorkspaceChatQueue({
    activeRequest,
    setActiveRequest,
    setMessages,
    setQueue,
    executeSend,
  });

  return {
    messages,
    isSending,
    sendMessage,
    sendMessageNow,
    activeRequest,
    cancelCurrentRequest,
    queue,
    editQueuedMessage,
    moveQueuedMessage,
    cancelQueuedMessage,
    sendQueuedMessageNow,
    sessions,
    activeSessionId,
    isLoadingSessions,
    startNewConversation,
    selectSession,
  };
}

export default useWorkspaceChat;
