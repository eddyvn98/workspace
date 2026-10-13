"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import type { WorkspaceChatMessage } from "../types/chat";
import { WorkspaceChatMessageItem } from "./WorkspaceChatMessageItem";

interface WorkspaceChatMessageListProps {
  messages: WorkspaceChatMessage[];
  listRef?: React.Ref<HTMLDivElement>;
  isSending?: boolean;
  onSuggestionClick?: (question: string) => void;
}

export const WorkspaceChatMessageList = React.memo(function WorkspaceChatMessageList({
  messages,
  listRef,
  isSending = false,
  onSuggestionClick,
}: WorkspaceChatMessageListProps) {
  const isStreamingAssistant = messages.some(
    (m) => m.role === "assistant" && (m.isLoading || m.isStreaming)
  );

  return (
    <div
      ref={listRef}
      className="flex-1 space-y-3 overflow-y-auto p-4 pt-12 select-text scrollbar-thin"
    >
      {messages.length === 0 && (
        <div className="mt-6 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          <Sparkles className="mx-auto mb-2 h-6 w-6 text-orange-300" />
          <p>
            Hello! I can help you edit, expand, create, or restructure your mindmaps based on your ideas or attached documents.
          </p>
        </div>
      )}

      {messages.map((msg, index) => (
        <WorkspaceChatMessageItem
          key={msg.id ?? `${msg.role}-${index}`}
          msg={msg}
          index={index}
          onSuggestionClick={onSuggestionClick}
        />
      ))}

      {isSending && !isStreamingAssistant && (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2.5 dark:bg-slate-800">
            <div className="flex items-center gap-1">
              <div
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                style={{ animationDelay: "0ms" }}
              />
              <div
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                style={{ animationDelay: "120ms" }}
              />
              <div
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                style={{ animationDelay: "240ms" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default WorkspaceChatMessageList;
