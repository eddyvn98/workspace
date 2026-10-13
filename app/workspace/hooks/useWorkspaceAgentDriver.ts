"use client";

/**
 * Scriptable handle for automated checks (and AI agents operating the app)
 * so Workspace can be driven without mouse coordinates. Only installed when
 * the URL carries `?agentDriver=1`; it exposes nothing beyond what the
 * signed-in user can already do through the chat panel and the canvas.
 *
 *   await window.__wsAgent.send("Add a text block")  -> { reply, applied }
 *   window.__wsAgent.state()                          -> board summary
 *   window.__wsAgent.setText(blockId, "text")         -> manual edit
 *   window.__wsAgent.undo() / redo() / select([ids])
 *   window.__wsAgent.enqueue("...")  -> queues behind a running turn (Enter while busy)
 *   await window.__wsAgent.idle()    -> resolves when nothing is running or queued
 *   window.__wsAgent.replies(n)      -> assistant messages from index n, in order
 * `send` interrupts a running turn (send-now); use `enqueue` to test the queue.
 */
import { useEffect, useRef } from "react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { isWorkspaceRealtimeLive } from "../utils/workspaceRealtimeProjection";
import { runWorkspaceHistoryAction } from "../utils/workspaceHistoryBridge";
import { formatSelectedBlocksContext } from "../utils/workspaceChatContext";
import type { WorkspaceChatMessage } from "../types/chat";

type SendFn = (text: string, options?: Record<string, unknown>) => unknown;

interface DriverInput {
  messages: WorkspaceChatMessage[];
  isSending: boolean;
  sendMessageNow: SendFn;
  /** Queue-aware send: waits behind a running request like the chat box does. */
  sendMessage: SendFn;
  queueLength: number;
}

const SETTLE_POLL_MS = 250;
const SEND_TIMEOUT_MS = 120_000;
const QUEUE_IDLE_TIMEOUT_MS = 20 * 60_000;

function boardSummary() {
  const state = useWorkspaceStore.getState();
  return {
    boardId: state.boardId,
    live: state.boardId ? isWorkspaceRealtimeLive(state.boardId) : false,
    selected: state.selectedBlockIds,
    blocks: state.blockOrder.map((id) => {
      const block = state.blocks[id];
      const t = block?.transform?.override ?? block?.transform?.computed;
      const data = (block?.data ?? {}) as Record<string, unknown>;
      return {
        id,
        type: block?.type,
        text: [data.markdown, data.label, data.text, data.title, data.url, data.name]
          .find((value): value is string => typeof value === "string" && value.length > 0),
        x: t?.x, y: t?.y, w: t?.w, h: t?.h,
      };
    }),
    connectors: Object.keys(state.connectors).length,
  };
}

export function useWorkspaceAgentDriver(input: DriverInput): void {
  const latest = useRef(input);
  latest.current = input;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("agentDriver") !== "1") return;

    const driver = {
      state: boardSummary,
      select: (ids: string[]) => useWorkspaceStore.getState().setSelection(ids),
      undo: () => runWorkspaceHistoryAction("undo"),
      redo: () => runWorkspaceHistoryAction("redo"),
      setText: (blockId: string, markdown: string) => {
        const store = useWorkspaceStore.getState();
        const block = store.blocks[blockId];
        if (!block) return false;
        store.updateBlock(blockId, { data: { ...(block.data as object), markdown } } as never);
        return true;
      },
      enqueue(text: string) {
        const store = useWorkspaceStore.getState();
        const { summaryLabels, contextPrompt } = formatSelectedBlocksContext(store.selectedBlockIds, store.blocks);
        void latest.current.sendMessage(text, {
          attachedFiles: [],
          contextPrompt: summaryLabels.length > 0 ? contextPrompt : undefined,
        });
      },
      async idle() {
        const started = Date.now();
        await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS * 2));
        while (Date.now() - started < QUEUE_IDLE_TIMEOUT_MS) {
          if (!latest.current.isSending && latest.current.queueLength === 0) return true;
          await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
        }
        return false;
      },
      replies(from = 0) {
        return latest.current.messages.slice(from).filter((m) => m.role === "assistant").map((m) => ({
          reply: m.content,
          applied: (m as { appliedSummaries?: string[] }).appliedSummaries ?? [],
          unresolved: (m as { unresolvedSummaries?: string[] }).unresolvedSummaries ?? [],
        }));
      },
      messageCount: () => latest.current.messages.length,
      async send(text: string) {
        const before = latest.current.messages.length;
        // Same selection context the chat panel attaches for a real user.
        const store = useWorkspaceStore.getState();
        const { summaryLabels, contextPrompt } = formatSelectedBlocksContext(store.selectedBlockIds, store.blocks);
        void latest.current.sendMessageNow(text, {
          attachedFiles: [],
          contextPrompt: summaryLabels.length > 0 ? contextPrompt : undefined,
        });
        const started = Date.now();
        // Wait for the turn to start, then to finish.
        await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS * 2));
        while (Date.now() - started < SEND_TIMEOUT_MS) {
          const { isSending, messages } = latest.current;
          if (!isSending && messages.length > before) break;
          await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
        }
        const last = [...latest.current.messages].reverse().find((m) => m.role === "assistant");
        return {
          reply: last?.content ?? null,
          applied: (last as { appliedSummaries?: string[] } | undefined)?.appliedSummaries ?? [],
          unresolved: (last as { unresolvedSummaries?: string[] } | undefined)?.unresolvedSummaries ?? [],
        };
      },
    };
    (window as unknown as { __wsAgent?: typeof driver }).__wsAgent = driver;
    return () => {
      delete (window as unknown as { __wsAgent?: typeof driver }).__wsAgent;
    };
  }, []);
}
