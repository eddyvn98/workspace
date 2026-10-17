"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUp, FileText, Loader2, Plus, Square, X } from "lucide-react";
import { AIActionLauncher } from "@/components/child-components/ai-select-models";
import { AIModelsType } from "@/lib/ai-models";
import {
  WORKSPACE_DIFY_VISIBLE_MODEL_IDS,
} from "@/lib/ai-model-catalog";
import { useMessageStore } from "@/stores/useMessageStore";
import { cn } from "@/lib/utils";
import type { WorkspaceAttachedFile } from "../types/chat";

interface WorkspaceChatInputProps {
  draft: string;
  setDraft: (v: string) => void;
  isSending: boolean;
  onSend: () => void;
  /** Present only while a Dify response is actively streaming — renders Stop instead of Send. */
  isRequestActive?: boolean;
  onStop?: () => void;
  /** Ctrl/Cmd+Enter while a response is active — cancels it and sends this one immediately. */
  onSendNow?: () => void;
  attachedFiles?: WorkspaceAttachedFile[];
  onUploadFile?: (file: File) => Promise<void>;
  onRemoveFile?: (key: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  placeholder?: string;
  isBoardLoading?: boolean;
}

const CHAT_HIDDEN_GROUP_IDS = ["google"] as const;

export function WorkspaceChatInput({
  draft,
  setDraft,
  isSending,
  onSend,
  isRequestActive = false,
  onStop,
  onSendNow,
  attachedFiles = [],
  onUploadFile,
  onRemoveFile,
  inputRef,
  placeholder = "Type a request or attach a document...",
  isBoardLoading = false,
}: WorkspaceChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const defaultModelId = "openai/gpt-5.6-luna";
    const defaultModel = AIModelsType.find((model) => model.id === defaultModelId);
    if (defaultModel && useMessageStore.getState().selectedModel.id !== defaultModel.id) {
      useMessageStore.getState().setSelectedModel(defaultModel);
    }
  }, []);

  const isUploading = attachedFiles.some((f) => f.status === "uploading");
  // Sending while a response is already streaming is allowed — the hook
  // queues it instead of dropping it, so the composer stays usable.
  const isSendDisabled = isBoardLoading || isUploading || (!draft.trim() && attachedFiles.length === 0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !onUploadFile) return;
    for (let i = 0; i < files.length; i++) {
      void onUploadFile(files[i]);
    }
    e.target.value = "";
  };

  const uploadDroppedFiles = (files: FileList) => {
    if (!onUploadFile) return;
    for (const file of Array.from(files)) {
      void onUploadFile(file);
    }
  };

  const adjustHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 180);
    el.style.height = `${nextHeight}px`;
  };

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    if (!draft || textarea.value !== draft) {
      adjustHeight(textarea);
    }
  }, [draft, inputRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      if (isSendDisabled) return;
      // While a response is streaming, plain Enter queues the message
      // behind it; Ctrl/Cmd+Enter interrupts it and sends immediately.
      if ((e.ctrlKey || e.metaKey) && isRequestActive && onSendNow) {
        onSendNow();
      } else {
        onSend();
      }
    }
  };

  return (
    <div className="flex shrink-0 flex-col bg-transparent p-3">
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          uploadDroppedFiles(e.dataTransfer.files);
        }}
        className={cn(
          "relative flex flex-col gap-2 rounded-2xl border bg-white p-2.5 shadow-sm transition-all dark:bg-slate-900",
          isDragging
            ? "border-orange-500 ring-2 ring-orange-500/20"
            : "border-slate-200 dark:border-slate-800"
        )}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-orange-50/90 text-xs font-medium text-orange-600 dark:bg-orange-950/90 dark:text-orange-300">
            Drop files to attach
          </div>
        )}

        {/* 1. Attached Files Thumbnails Section */}
        {attachedFiles.length > 0 && (
          <div className="scrollbar-thin flex max-h-24 flex-wrap gap-2 overflow-y-auto p-1">
            {attachedFiles.map((file) => {
              const uploading = file.status === "uploading";
              const isError = file.status === "error";
              const isImage = file.type.startsWith("image/");
              const fileKey = file.id || file.tempId || file.name;
              const imageUrl = file.url || file.previewUrl;

              return (
                <div
                  key={fileKey}
                  className="relative flex min-w-0 max-w-[140px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1 pr-7 pl-2 text-[10px] text-slate-700 shadow-sm select-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                >
                  {isImage && imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={file.name}
                      width={16}
                      height={16}
                      unoptimized
                      className="h-4 w-4 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-sky-400" />
                  )}
                  <span className="flex-1 truncate font-medium">{file.name}</span>
                  {uploading && (
                    <Loader2 className="absolute right-2 h-3 w-3 animate-spin text-blue-500" />
                  )}
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => onRemoveFile?.(fileKey)}
                      className="absolute right-1.5 cursor-pointer rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800"
                      title="Remove attachment"
                      aria-label="Remove attachment"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  {isError && (
                    <span
                      className="absolute right-1.5 text-[8px] text-red-500"
                      title="Upload error"
                    >
                      Error
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 2. Textarea Section */}
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            adjustHeight(e.target);
            setDraft(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={isSending ? "AI is replying... (Enter to queue, ⌘/Ctrl+Enter to send now)" : placeholder}
          rows={1}
          className="min-h-[24px] max-h-[180px] w-full resize-none border-none bg-transparent p-1 text-xs text-slate-800 placeholder:text-slate-400 shadow-none outline-none select-text focus:outline-none focus:ring-0 focus-visible:ring-0 [field-sizing:content] dark:text-slate-200 dark:placeholder:text-slate-500"
        />

        {/* 3. Bottom Bar Toolbar */}
        <div className="mt-1 flex items-center justify-between border-t border-slate-200/50 pt-2 dark:border-slate-800/40">
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              accept="image/*,application/pdf,text/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-transparent text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
              title={isBoardLoading ? "Workspace is loading..." : "Attach image or document"}
              aria-label="Attach image or document"
            >
              <Plus className="h-4 w-4" />
            </button>

            <div className="origin-left scale-90">
              <AIActionLauncher
                variant="ghost"
                hiddenGroupIds={CHAT_HIDDEN_GROUP_IDS}
                visibleModelIds={WORKSPACE_DIFY_VISIBLE_MODEL_IDS}
                compact
                showCapabilities={false}
                showLegend={false}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRequestActive ? (
              <button
                type="button"
                onClick={onStop}
                title="Stop"
                aria-label="Stop"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-slate-800 text-white shadow-sm transition-colors hover:bg-slate-900 dark:bg-orange-500 dark:hover:bg-orange-400"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={isSendDisabled}
                className={cn(
                  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-all",
                  isSendDisabled
                    ? "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                    : "bg-orange-500 text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600"
                )}
                title={isBoardLoading ? "Workspace is loading..." : isSending ? "Queue (AI is replying...)" : "Send (Enter)"}
                aria-label="Send (Enter)"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceChatInput;
