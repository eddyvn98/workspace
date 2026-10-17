"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceAgentDriver } from "../hooks/useWorkspaceAgentDriver";
import { Sparkles } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { useWorkspaceChat } from "../hooks/useWorkspaceChat";
import { useWorkspaceChatFileUpload } from "../hooks/useWorkspaceChatFileUpload";
import { formatSelectedBlocksContext } from "../utils/workspaceChatContext";
import { WORKSPACE_CHAT_CATEGORY } from "../utils/workspaceChatRequest";
import { WorkspaceChatHistoryDrawer } from "./WorkspaceChatHistoryDrawer";
import { WorkspaceChatInput } from "./WorkspaceChatInput";
import { WorkspaceChatMessageList } from "./WorkspaceChatMessageList";
import { WorkspaceChatQueueTray } from "./WorkspaceChatQueueTray";
import { WorkspaceChatPanelHeader } from "./WorkspaceChatPanelHeader";
import { useWorkspaceChatPanelLayout } from "../hooks/useWorkspaceChatPanelLayout";
import { workspaceKeyboardScope } from "../utils/workspaceKeyboardScope";

const WORKSPACE_DIFY_UPLOAD_HEADERS = {
  "x-category": WORKSPACE_CHAT_CATEGORY,
};

export interface WorkspaceChatPanelProps {
  onClose?: () => void;
  visible?: boolean;
  initialPrompt?: string;
  chatWidth?: number;
  onResizeEnd?: (width: number) => void;
  rightOffset?: number;
  isBoardLoading?: boolean;
}

export const WorkspaceChatPanel = React.memo(function WorkspaceChatPanel({
  onClose,
  visible = true,
  initialPrompt,
  chatWidth = 320,
  onResizeEnd,
  rightOffset = 0,
  isBoardLoading = false,
}: WorkspaceChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [panelWidth, setPanelWidth] = useState(chatWidth);

  const difyChat = useWorkspaceChat();
  const {
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
  } = difyChat;
  useWorkspaceAgentDriver({ messages, isSending, sendMessageNow, sendMessage, queueLength: queue.length });

  const chatBoardId = useWorkspaceStore((state) => state.boardId);
  const { attachedFiles, uploadFile, removeFile, clearFiles } =
    useWorkspaceChatFileUpload(chatBoardId ?? undefined, "/api/chat/files", WORKSPACE_DIFY_UPLOAD_HEADERS);

  const selectedBlockIds = useWorkspaceStore((state) => state.selectedBlockIds);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const setSelection = useWorkspaceStore((state) => state.setSelection);
  const listRef = useRef<HTMLDivElement>(null);
  const { inputRef, panelRef, handleTouchStart, handleTouchMove, handleTouchEnd, handleResizeStart } = useWorkspaceChatPanelLayout(visible, panelWidth, setPanelWidth, onClose, onResizeEnd);
  const sentInitialPrompt = useRef<string | null>(null);
  const { summaryLabels, contextPrompt } = formatSelectedBlocksContext(selectedBlockIds, blocks);

  useEffect(() => {
    if (visible && listRef.current) {
      if (typeof listRef.current.scrollTo === "function") {
        listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      } else {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
  }, [messages, visible]);
  const handleSend = useCallback(
    (text?: string) => {
      const query = (text ?? draft).trim();
      // Sending while a response is already streaming is allowed — it
      // queues behind the current one instead of being dropped.
      if (!query && attachedFiles.length === 0) return;

      const files = [...attachedFiles];
      clearFiles();
      if (!text) setDraft("");

      void sendMessage(query, {
        attachedFiles: files,
        contextPrompt: summaryLabels.length > 0 ? contextPrompt : undefined,
      });
    },
    [draft, attachedFiles, clearFiles, sendMessage, summaryLabels.length, contextPrompt]
  );

  // Ctrl/Cmd+Enter while a response is streaming — cancels it and sends
  // this one immediately instead of queuing behind it.
  const handleSendNow = useCallback(() => {
    const query = draft.trim();
    if (!query && attachedFiles.length === 0) return;

    const files = [...attachedFiles];
    clearFiles();
    setDraft("");

    void sendMessageNow(query, {
      attachedFiles: files,
      contextPrompt: summaryLabels.length > 0 ? contextPrompt : undefined,
    });
  }, [draft, attachedFiles, clearFiles, sendMessageNow, summaryLabels.length, contextPrompt]);

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useEffect(() => {
    if (!initialPrompt || sentInitialPrompt.current === initialPrompt) return;
    sentInitialPrompt.current = initialPrompt;
    handleSendRef.current(initialPrompt);
  }, [initialPrompt]);

  const handleNewConversation = () => {
    clearFiles();
    setDraft("");
    startNewConversation();
    setShowHistory(false);
  };

  return (
    <div hidden={!visible}>
      <div
        className="fixed inset-0 z-40 bg-slate-950/25 sm:hidden"
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        data-workspace-chat-panel="true"
        data-mindmap-chat-panel="true"
        {...workspaceKeyboardScope("chat")}
        style={{
          "--workspace-chat-width": `${panelWidth}px`,
          right: `${rightOffset}px`,
        } as React.CSSProperties}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[min(65vh,600px)] w-full max-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white/95 shadow-2xl backdrop-blur sm:fixed sm:inset-auto sm:top-[6.5rem] sm:right-0 sm:bottom-0 sm:h-auto sm:max-h-none sm:w-[var(--workspace-chat-width)] sm:rounded-none sm:border-t-0 sm:border-r-0 sm:border-l sm:border-slate-200/70 sm:shadow-xl dark:border-slate-800 dark:bg-slate-900/95"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 bottom-0 left-0 z-20 hidden w-1.5 cursor-col-resize hover:bg-orange-400/40 active:bg-orange-400/60 transition-colors sm:block"
          title="Drag to resize width"
        />

        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flex shrink-0 cursor-ns-resize justify-center pt-3 pb-3 sm:hidden"
        >
          <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>

        <WorkspaceChatPanelHeader
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory((value) => !value)}
          onNewConversation={handleNewConversation}
          isSending={isSending}
          onClose={onClose}
        />

        {showHistory && (
          <WorkspaceChatHistoryDrawer
            sessions={sessions}
            activeSessionId={activeSessionId}
            isLoading={isLoadingSessions}
            onSelectSession={(id) => {
              void selectSession(id);
              setShowHistory(false);
            }}
            onNewConversation={handleNewConversation}
            onClose={() => setShowHistory(false)}
          />
        )}

        <WorkspaceChatMessageList
          messages={messages}
          listRef={listRef}
          isSending={isSending}
          onSuggestionClick={(question) => handleSend(question)}
        />

        {summaryLabels.length > 0 ? (
          <div className="flex shrink-0 select-none items-center justify-between px-4 py-2 text-[11px] text-orange-800 dark:text-orange-300">
            <div className="flex min-w-0 items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-orange-500" />
              <span className="truncate">
                Selected {summaryLabels.length} block(s): <strong>{summaryLabels.join(", ")}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelection([])}
              className="ml-2 shrink-0 cursor-pointer font-semibold text-orange-500 hover:text-orange-700 hover:underline"
              title="Deselect to chat globally"
            >
              Deselect
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 select-none items-center gap-1.5 px-4 pb-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span>Discussion Mode</span>
          </div>
        )}

        <WorkspaceChatQueueTray
          queue={queue}
          onEdit={editQueuedMessage}
          onMove={moveQueuedMessage}
          onCancel={cancelQueuedMessage}
          onSendNow={sendQueuedMessageNow}
        />

        <WorkspaceChatInput
          draft={draft}
          setDraft={setDraft}
          isSending={isSending}
          isRequestActive={!!activeRequest}
          onStop={cancelCurrentRequest}
          onSendNow={handleSendNow}
          onSend={() => handleSend()}
          attachedFiles={attachedFiles}
          onUploadFile={uploadFile}
          onRemoveFile={removeFile}
          inputRef={inputRef}
          isBoardLoading={isBoardLoading}
        />
      </div>
    </div>
  );
});

export default WorkspaceChatPanel;
