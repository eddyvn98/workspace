"use client";

import React, { useState } from "react";
import { Check, CheckCircle2, Copy, Download, FileText, ImageIcon, LoaderCircle, Sparkles } from "lucide-react";
import MessageFormatter from "@/lib/markdown/MessageFormatter.client";
import { copyTextToClipboard } from "@/lib/utils/copy-text-to-clipboard";
import type { WorkspaceChatMessage } from "../types/chat";
import { safeWorkspaceAssistantContent } from "../utils/workspaceChatVisibleContent";
import { focusWorkspaceBlocks } from "../utils/workspaceCameraFocus";
import WorkspaceChatReferenceChips from "./WorkspaceChatReferenceChips";

interface WorkspaceChatMessageItemProps {
  msg: WorkspaceChatMessage;
  index: number;
  /** Agent-mode only — sends a suggestion chip's text as the next message. */
  onSuggestionClick?: (question: string) => void;
}

export const WorkspaceChatMessageItem = React.memo(function WorkspaceChatMessageItem({
  msg,
  onSuggestionClick,
}: WorkspaceChatMessageItemProps) {
  const [copied, setCopied] = useState(false);
  const displayContent =
    msg.role === "assistant"
      ? safeWorkspaceAssistantContent(msg.content, Boolean(msg.isStreaming || msg.isLoading), msg.verifiedRecordIds)
      : msg.content;

  const copyContent = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const copiedSuccessfully = await copyTextToClipboard(displayContent);
    if (!copiedSuccessfully) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleSelectionCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString()) return;
    if (!selection.anchorNode || !selection.focusNode) return;
    if (
      !event.currentTarget.contains(selection.anchorNode) ||
      !event.currentTarget.contains(selection.focusNode)
    ) {
      return;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", selection.toString());
  };

  if (msg.role === "user") {
    return (
      <div className="flex w-full min-w-0 flex-col items-end">
        <div
          data-testid="workspace-user-message-bubble"
          onCopy={handleSelectionCopy}
          className="max-w-[85%] cursor-text select-text break-words whitespace-pre-wrap rounded-2xl border border-slate-300 px-3 py-2 text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:text-slate-200"
        >
          {msg.content}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {msg.attachments.map((file) => {
                const key = file.id || file.tempId || file.name;
                const imageUrl = file.previewUrl || file.url;
                if (file.type.startsWith("image/") && imageUrl) {
                  return (
                    <div
                      key={key}
                      className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      <a
                        href={imageUrl}
                        download={file.name}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {/* Keep natural image dimensions for uploaded data/blob previews. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl}
                          alt={file.name}
                          className="block max-h-36 w-full object-cover"
                        />
                      </a>
                      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px]">
                        <ImageIcon className="h-3 w-3 shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <a
                          href={imageUrl}
                          download={file.name}
                          className="ml-auto p-0.5 text-slate-400 hover:text-orange-500"
                          title="Download attachment"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Download className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  );
                }
                const downloadUrl = file.url || file.previewUrl;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] dark:border-slate-700"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{file.name}</span>
                    {downloadUrl && (
                      <a
                        href={downloadUrl}
                        download={file.name}
                        className="ml-auto p-0.5 text-slate-400 hover:text-orange-500"
                        title="Download attachment"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Download className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={copyContent}
          className="mt-1 cursor-pointer p-1 text-slate-400 hover:text-orange-500"
          title="Copy message"
          aria-label="Copy message"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  }

  // Agent-mode only: which blocks this reply's tool calls actually touched.
  // Ported from legacy Mindmap's focusNodeIds/handleFocusClick
  // (PageChatMessageItem.tsx) — clicking the bubble or the Focus action pans
  // the camera there and re-selects them, so "what did the AI just do" has
  // an answer besides re-reading the prose.
  const focusBlockIds = msg.focusBlockIds ?? [];
  const hasCanvasChanges = focusBlockIds.length > 0;
  const handleFocusClick = () => {
    if (focusBlockIds.length > 0) focusWorkspaceBlocks(focusBlockIds);
  };
  const handleBubbleClick = () => {
    if (window.getSelection()?.toString().trim()) return;
    handleFocusClick();
  };

  return (
    <div className="flex w-full min-w-0 flex-col items-start">
      <div
        data-testid="workspace-ai-message-bubble"
        onCopy={handleSelectionCopy}
        onClick={hasCanvasChanges ? handleBubbleClick : undefined}
        className={`w-full max-w-[95%] min-w-0 select-text px-1 py-2 text-slate-800 dark:text-slate-200 ${hasCanvasChanges ? "cursor-pointer" : "cursor-text"}`}
      >
        <div className="[&_code]:text-[11px] [&_h1]:my-3 [&_h1]:text-[15px] [&_h1]:font-bold [&_h2]:my-2 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:text-[13px] [&_h3]:font-semibold [&_li]:my-1 [&_li]:text-[13px] [&_li]:leading-relaxed [&_ol]:my-2 [&_ol]:pl-4 [&_p]:my-2 [&_p]:text-[13px] [&_p]:leading-relaxed [&_pre]:my-2 [&_pre]:p-2 [&_ul]:my-2 [&_ul]:pl-4">
          <MessageFormatter
            content={displayContent}
            isUser={false}
            isLoading={msg.isStreaming || msg.isLoading}
          />
        </div>
        {msg.runtimeProgressText && (msg.isLoading || msg.isStreaming) && (
          <div role="status" aria-live="polite" className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
            <span>{msg.runtimeProgressText}</span>
          </div>
        )}
        {msg.cancelled && (
          <div className="mt-1 flex items-center gap-1">
            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">✕ Cancelled</span>
          </div>
        )}
        {hasCanvasChanges && (
          <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
              <span className="truncate text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                {msg.appliedSummaries?.length ? msg.appliedSummaries.join(" · ") : "Applied to canvas"}
              </span>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleFocusClick();
              }}
              className="ml-2 shrink-0 cursor-pointer text-[10px] font-semibold text-orange-500 hover:text-orange-600 hover:underline dark:text-orange-400 dark:hover:text-orange-300"
            >
              Focus
            </button>
          </div>
        )}
        {msg.unresolvedSummaries && msg.unresolvedSummaries.length > 0 && (
          <div className="mt-2 flex items-start gap-1.5">
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            <div className="flex flex-col gap-0.5">
              {msg.unresolvedSummaries.map((reason) => (
                <span key={reason} className="text-[10px] text-amber-600 dark:text-amber-400">
                  {reason} — attempted, but applied nothing
                </span>
              ))}
            </div>
          </div>
        )}
        {msg.references && <WorkspaceChatReferenceChips references={msg.references} />}
      </div>
      {!msg.isStreaming && !msg.isLoading && (msg.suggestions?.grounded?.length || msg.suggestions?.expand?.length) ? (
        <div className="mt-2 flex w-full max-w-[95%] flex-col gap-2 px-2 pb-1">
          {msg.suggestions.grounded.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onSuggestionClick?.(question)}
              title="Use the current board/document content"
              className="w-full cursor-pointer rounded-2xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-left text-[11px] leading-relaxed text-orange-800 transition-colors hover:bg-orange-100 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20"
            >
              {question}
            </button>
          ))}
          {msg.suggestions.expand.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onSuggestionClick?.(question)}
              title="Expand beyond the current board content"
              className="w-full cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-transparent px-4 py-2.5 text-left text-[11px] leading-relaxed text-slate-500 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              {question}
            </button>
          ))}
        </div>
      ) : null}
      {msg.content && (
        <button
          type="button"
          onClick={copyContent}
          className="mt-1 cursor-pointer p-1 text-slate-400 hover:text-orange-500"
          title="Copy message"
          aria-label="Copy message"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
});

export default WorkspaceChatMessageItem;
