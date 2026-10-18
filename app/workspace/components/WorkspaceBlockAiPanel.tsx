"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useWorkspaceChat } from "../hooks/useWorkspaceChat";
import { useWorkspaceChatFileUpload } from "../hooks/useWorkspaceChatFileUpload";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { formatSelectedBlocksContext } from "../utils/workspaceChatContext";
import { WORKSPACE_CHAT_CATEGORY } from "../utils/workspaceChatRequest";
import { workspaceKeyboardScope } from "../utils/workspaceKeyboardScope";
import { WorkspaceChatInput } from "./WorkspaceChatInput";
import { WorkspaceChatMessageList } from "./WorkspaceChatMessageList";
import { WorkspaceChatQueueTray } from "./WorkspaceChatQueueTray";

const UPLOAD_HEADERS = { "x-category": WORKSPACE_CHAT_CATEGORY };

export function WorkspaceBlockAiPanel({ boardId, blockId, blockType, forceReadOnly = false }: { boardId: string; blockId: string; blockType: "doc" | "table"; forceReadOnly?: boolean }) {
  const label = blockType === "doc" ? "Document" : "Spreadsheet";
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const chat = useWorkspaceChat();
  const { attachedFiles, uploadFile, removeFile, clearFiles } =
    useWorkspaceChatFileUpload(boardId, "/api/chat/files", UPLOAD_HEADERS);
  const isReadOnly = useWorkspaceStore((state) => state.isReadOnly);
  const cancelRef = useRef(chat.cancelCurrentRequest);
  cancelRef.current = chat.cancelCurrentRequest;

  useEffect(() => () => cancelRef.current(), []);
  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages]);

  const getContext = useCallback(() => {
    const state = useWorkspaceStore.getState();
    if (forceReadOnly || state.isReadOnly || state.boardId !== boardId || state.blocks[blockId]?.type !== blockType) return null;
    return `${formatSelectedBlocksContext([blockId], state.blocks).contextPrompt}\n` +
      `The user is editing ${label.toLowerCase()} ${JSON.stringify(blockId)} in full view. ` +
      "Apply requested edits to this existing block in place, preserving unrelated content and formatting. " +
      "Do not create a replacement block unless explicitly requested.";
  }, [boardId, blockId, blockType, label, forceReadOnly]);

  const send = useCallback((text?: string, immediately = false) => {
    const query = (text ?? draft).trim();
    const contextPrompt = getContext();
    if (!contextPrompt || (!query && attachedFiles.length === 0) || attachedFiles.some((file) => file.status === "uploading")) return;
    const files = [...attachedFiles];
    clearFiles();
    if (text === undefined) setDraft("");
    void (immediately ? chat.sendMessageNow : chat.sendMessage)(query, { attachedFiles: files, contextPrompt });
  }, [attachedFiles, chat.sendMessage, chat.sendMessageNow, clearFiles, draft, getContext]);

  const sendQueuedNow = (id: string) => {
    if (getContext()) chat.sendQueuedMessageNow(id);
  };

  return (
    <aside
      aria-label={`${label} AI assistant`}
      {...workspaceKeyboardScope("chat")}
      className="flex h-[45vh] min-h-0 shrink-0 flex-col overflow-hidden border-t border-slate-200 bg-white md:h-full md:w-[360px] md:border-l md:border-t-0 dark:border-slate-800 dark:bg-slate-900"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200">
        <Sparkles className="h-4 w-4 text-orange-500" /> {label} AI
      </div>
      <WorkspaceChatMessageList messages={chat.messages} listRef={listRef} isSending={chat.isSending} onSuggestionClick={(text) => send(text)} />
      {(forceReadOnly || isReadOnly) ? (
        <p className="shrink-0 p-4 text-xs text-slate-500">This {label.toLowerCase()} is read-only.</p>
      ) : (
        <>
          <WorkspaceChatQueueTray
            queue={chat.queue}
            onEdit={chat.editQueuedMessage}
            onMove={chat.moveQueuedMessage}
            onCancel={chat.cancelQueuedMessage}
            onSendNow={sendQueuedNow}
          />
          <WorkspaceChatInput
            draft={draft}
            setDraft={setDraft}
            inputRef={inputRef}
            isSending={chat.isSending}
            isRequestActive={Boolean(chat.activeRequest)}
            onSend={() => send()}
            onSendNow={() => send(undefined, true)}
            onStop={chat.cancelCurrentRequest}
            attachedFiles={attachedFiles}
            onUploadFile={uploadFile}
            onRemoveFile={removeFile}
            placeholder={`Ask AI to edit this ${label.toLowerCase()}…`}
          />
        </>
      )}
    </aside>
  );
}
