import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type {
  WorkspaceActiveRequest,
  WorkspaceAttachedFile,
  WorkspaceChatMessage,
  WorkspaceQueuedSend,
} from "../types/chat";
import { difyWorkspaceAgentProvider } from "./workspaceChatTransport";

// Shared by every caller that aborts the active request and then also needs
// to stop it server-side — a no-op when there was nothing to stop.
function stopServerSideIfNeeded(req: WorkspaceActiveRequest | null): Promise<void> {
  if (!req) return Promise.resolve();
  return difyWorkspaceAgentProvider.cancel({
    taskId: req.taskId, turnId: req.turnId,
    boardId: useWorkspaceStore.getState().boardId,
    user: useWorkspaceStore.getState().currentUserEmail,
  });
}

type SendOpts = { attachedFiles?: WorkspaceAttachedFile[]; contextPrompt?: string };
type ExecuteSend = (query: string, opts?: SendOpts) => Promise<void>;

interface UseWorkspaceChatQueueArgs {
  activeRequest: WorkspaceActiveRequest | null;
  setActiveRequest: Dispatch<SetStateAction<WorkspaceActiveRequest | null>>;
  setMessages: Dispatch<SetStateAction<WorkspaceChatMessage[]>>;
  setQueue: Dispatch<SetStateAction<WorkspaceQueuedSend[]>>;
  executeSend: ExecuteSend;
}

/** Pause/cancel/queue control for useWorkspaceChat: sending while a request
 *  is already in flight queues behind it (Dify — and the board-diffing the
 *  hook does around every send — only supports one at a time) rather than
 *  being dropped, and every queued entry can be edited, reordered, or
 *  cancelled before it actually runs. Kept separate from the actual
 *  Dify-calling logic in useWorkspaceChat/executeSend so this file only ever
 *  has to reason about ordering, not about what a send does. */
export function useWorkspaceChatQueue({
  activeRequest,
  setActiveRequest,
  setMessages,
  setQueue,
  executeSend,
}: UseWorkspaceChatQueueArgs) {
  // Aborts the current request (if any) and marks its bubble cancelled.
  // Returns the aborted request so callers that also need to stop it
  // server-side (cancel, send-now) can do so.
  const abortActiveRequest = useCallback((): WorkspaceActiveRequest | null => {
    const cur = activeRequest;
    if (!cur) return null;
    cur.controller.abort();
    setActiveRequest(null);
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== cur.assistantId) return m;
        return {
          ...m,
          isLoading: false,
          cancelled: true,
          content: m.content && m.content.trim() ? m.content : "Đã hủy.",
        };
      }),
    );
    return cur;
  }, [activeRequest, setActiveRequest, setMessages]);

  const cancelCurrentRequest = useCallback(() => {
    void stopServerSideIfNeeded(abortActiveRequest());
  }, [abortActiveRequest]);

  // Sends a message. If a request is already running, queues it instead of
  // firing immediately — the queued entry can still be edited, reordered, or
  // cancelled from the queue tray before it actually runs.
  const sendMessage = useCallback(
    async (query: string, opts?: SendOpts) => {
      const trimmed = query.trim();
      const files = opts?.attachedFiles ?? [];
      if (!trimmed && files.length === 0) return;

      if (activeRequest) {
        const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setQueue((prev) => [...prev, { id, query, opts }]);
        return;
      }

      await executeSend(query, opts);
    },
    [activeRequest, executeSend, setQueue]
  );

  // Sends immediately, interrupting whatever is currently running.
  const sendMessageNow = useCallback(
    async (query: string, opts?: SendOpts) => {
      await stopServerSideIfNeeded(abortActiveRequest());
      await executeSend(query, opts);
    },
    [abortActiveRequest, executeSend]
  );

  const editQueuedMessage = useCallback((queueId: string, newQuery: string) => {
    setQueue((prev) => prev.map((q) => (q.id === queueId ? { ...q, query: newQuery } : q)));
  }, [setQueue]);

  const moveQueuedMessage = useCallback((queueId: string, direction: "up" | "down") => {
    setQueue((prev) => {
      const idx = prev.findIndex((q) => q.id === queueId);
      if (idx === -1) return prev;
      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }, [setQueue]);

  const cancelQueuedMessage = useCallback((queueId: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== queueId));
  }, [setQueue]);

  // Pulls one queued message out of order and runs it immediately,
  // interrupting the current request first if needed.
  const sendQueuedMessageNow = useCallback(
    async (queueId: string) => {
      let item: WorkspaceQueuedSend | undefined;
      setQueue((prev) => {
        item = prev.find((q) => q.id === queueId);
        return prev.filter((q) => q.id !== queueId);
      });
      if (!item) return;

      await stopServerSideIfNeeded(abortActiveRequest());
      await executeSend(item.query, item.opts);
    },
    [abortActiveRequest, executeSend, setQueue]
  );

  return {
    sendMessage,
    sendMessageNow,
    cancelCurrentRequest,
    editQueuedMessage,
    moveQueuedMessage,
    cancelQueuedMessage,
    sendQueuedMessageNow,
  };
}
