"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspaceChatMessage, WorkspaceChatSessionSummary } from "../types/chat";
import type { ChatSessionCategory } from "@/types/chat-sessions.types";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { mergeWorkspaceChatSessions, type LocalWorkspaceChatSession } from "./workspaceChatSessionMerge";

interface DifyMessageFile {
  id: string;
  filename?: string;
  name?: string;
  size?: number;
  type?: string;
  url?: string;
}

function localStorageKey(category: ChatSessionCategory, boardId?: string): string {
  return `workspace-chat-sessions:v1:${category}:${boardId || "none"}`;
}

function readLocalSessions(category: ChatSessionCategory, boardId?: string): LocalWorkspaceChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(localStorageKey(category, boardId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalSession(category: ChatSessionCategory, boardId: string | undefined, session: LocalWorkspaceChatSession): void {
  if (typeof window === "undefined") return;
  const sessions = readLocalSessions(category, boardId).filter((item) => item.id !== session.id && item.difyConversationId !== session.difyConversationId);
  window.localStorage.setItem(localStorageKey(category, boardId), JSON.stringify([session, ...sessions].slice(0, 30)));
}

export function useWorkspaceChatSessions(category: ChatSessionCategory = "CHAT_KEY") {
  const workspaceBoardId = useWorkspaceStore((state) => state.boardId);
  const [sessions, setSessions] = useState<WorkspaceChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const fetchSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const params = new URLSearchParams({ category });
      if (workspaceBoardId) params.set("workspaceBoardId", workspaceBoardId);
      const res = await fetch(`/api/chat-sessions?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setSessions(readLocalSessions(category, workspaceBoardId));
        return;
      }
      const data = await res.json();
      const items: WorkspaceChatSessionSummary[] = data.items ?? [];
      setSessions(mergeWorkspaceChatSessions(items, readLocalSessions(category, workspaceBoardId)));
    } catch (err) {
      console.warn("[workspace chat] sessions fetch failed", err);
      setSessions(readLocalSessions(category, workspaceBoardId));
    } finally {
      setIsLoadingSessions(false);
    }
  }, [category, workspaceBoardId]);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions]);

  const loadSessionMessages = useCallback(
    async (sessionId: string): Promise<{ messages: WorkspaceChatMessage[]; difyConversationId?: string } | null> => {
      try {
        const res = await fetch(`/api/chat-sessions/${encodeURIComponent(sessionId)}/messages`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const local = readLocalSessions(category, workspaceBoardId).find((item) => item.id === sessionId);
          return local ? { messages: local.messages, difyConversationId: local.difyConversationId } : null;
        }
        const json = await res.json();
        if (Array.isArray(json.messages)) {
          return {
            messages: json.messages as WorkspaceChatMessage[],
            difyConversationId: typeof json.conversation_id === "string" ? json.conversation_id : undefined,
          };
        }
        const rawData = Array.isArray(json.data) ? json.data : [];
        const chronological = [...rawData].reverse();

        const messages: WorkspaceChatMessage[] = [];
        let difyConvId: string | undefined;

        for (const item of chronological) {
          if (item.conversation_id) difyConvId = item.conversation_id;
          if (item.query) {
            messages.push({
              role: "user",
              content: item.query,
              attachments: item.message_files?.map((f: DifyMessageFile) => ({
                id: f.id,
                name: f.filename || f.name || "attachment",
                size: f.size || 0,
                type: f.type === "image" ? "image/png" : "application/octet-stream",
                status: "done",
                url: f.url,
              })),
            });
          }
          if (item.answer) {
            messages.push({
              role: "assistant",
              content: item.answer,
            });
          }
        }

        return { messages, difyConversationId: difyConvId };
      } catch (err) {
        console.warn("[workspace chat] load session messages failed", err);
        const local = readLocalSessions(category, workspaceBoardId).find((item) => item.id === sessionId);
        return local ? { messages: local.messages, difyConversationId: local.difyConversationId } : null;
      }
    },
    [category, workspaceBoardId]
  );

  const upsertSession = useCallback(async (
    difyConversationId: string,
    title: string,
    messages?: WorkspaceChatMessage[],
  ) => {
    try {
      const res = await fetch("/api/chat-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          difyConversationId,
          title: title.slice(0, 100),
          ...(messages ? { workspaceMessages: messages } : {}),
          ...(workspaceBoardId ? { workspaceBoardId } : {}),
        }),
      });
      if (res.ok) {
        const doc = await res.json();
        if (doc?.id) {
          setActiveSessionId(doc.id);
          setSessions((prev) => [
            {
              id: doc.id,
              title: doc.title || title,
              category: doc.category || category,
              region: doc.region,
              updatedAt: doc.updatedAt || new Date().toISOString(),
              difyConversationId: doc.difyConversationId || difyConversationId,
            },
            ...prev.filter((s) => s.id !== doc.id && s.difyConversationId !== difyConversationId),
          ]);
        }
      } else {
        const now = new Date().toISOString();
        const existing = readLocalSessions(category, workspaceBoardId).find((item) => item.difyConversationId === difyConversationId);
        const local: LocalWorkspaceChatSession = {
          id: existing?.id || `local-${crypto.randomUUID()}`,
          title: title.slice(0, 100) || "New conversation",
          category,
          updatedAt: now,
          createdAt: existing?.createdAt || now,
          difyConversationId,
          workspaceBoardId,
          messages: messages || existing?.messages || [],
        };
        writeLocalSession(category, workspaceBoardId, local);
        setActiveSessionId(local.id);
        setSessions((prev) => [local, ...prev.filter((item) => item.id !== local.id)]);
      }
    } catch (err) {
      console.warn("[workspace chat] upsert session failed", err);
      const now = new Date().toISOString();
      const existing = readLocalSessions(category, workspaceBoardId).find((item) => item.difyConversationId === difyConversationId);
      const local: LocalWorkspaceChatSession = {
        id: existing?.id || `local-${crypto.randomUUID()}`,
        title: title.slice(0, 100) || "New conversation",
        category,
        updatedAt: now,
        createdAt: existing?.createdAt || now,
        difyConversationId,
        workspaceBoardId,
        messages: messages || existing?.messages || [],
      };
      writeLocalSession(category, workspaceBoardId, local);
      setActiveSessionId(local.id);
      setSessions((prev) => [local, ...prev.filter((item) => item.id !== local.id)]);
    }
  }, [category, workspaceBoardId]);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    isLoadingSessions,
    fetchSessions,
    loadSessionMessages,
    upsertSession,
  };
}
