"use client";

import React, { useState, useRef } from "react";
import { CheckCheck, CornerDownRight } from "lucide-react";
import type { WorkspaceComment } from "../hooks/workspaceCommentApi";
import { WorkspaceCommentRow } from "./WorkspaceCommentRow";

interface CommentThreadItemProps {
  comment: WorkspaceComment;
  replies: WorkspaceComment[];
  participants?: string[];
  onToggleResolved: (id: string, resolved: boolean) => void;
  onResolveThread?: (parentId: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, body: string) => void;
  onReply: (parentId: string, body: string) => void;
}

const MENTION_TRIGGER = /(?:^|\s)@([a-zA-Z0-9._%+-]*)$/;

export function CommentThreadItem({
  comment,
  replies,
  participants = [],
  onToggleResolved,
  onResolveThread,
  onDelete,
  onEdit,
  onReply,
}: CommentThreadItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  const mentionCandidates =
    replyMentionQuery === null
      ? []
      : participants.filter((p) => p.toLowerCase().includes(replyMentionQuery.toLowerCase())).slice(0, 5);

  const submitReply = () => {
    const body = replyDraft.trim();
    if (!body) return;
    onReply(comment.id, body);
    setReplyDraft("");
    setReplyMentionQuery(null);
    setIsReplying(false);
  };

  const handleReplyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    setReplyDraft(val);
    const match = MENTION_TRIGGER.exec(val.slice(0, cursor));
    setReplyMentionQuery(match ? match[1] : null);
  };

  const selectMention = (email: string) => {
    const cursor = replyInputRef.current?.selectionStart ?? replyDraft.length;
    const textBefore = replyDraft.slice(0, cursor);
    const textAfter = replyDraft.slice(cursor);
    const replaced = textBefore.replace(/(?:^|\s)@([a-zA-Z0-9._%+-]*)$/, (match) =>
      match.startsWith(" ") ? ` @${email} ` : `@${email} `
    );
    setReplyDraft(replaced + textAfter);
    setReplyMentionQuery(null);
    if (replyInputRef.current) {
      replyInputRef.current.focus();
    }
  };

  const allResolved = comment.resolved && replies.every((r) => r.resolved);

  return (
    <div className="space-y-1.5 rounded-xl bg-slate-50/50 p-1.5 dark:bg-slate-900/40">
      <WorkspaceCommentRow comment={comment} onToggleResolved={onToggleResolved} onDelete={onDelete} onEdit={onEdit} />

      {replies.map((reply) => (
        <WorkspaceCommentRow
          key={reply.id}
          comment={reply}
          onToggleResolved={onToggleResolved}
          onDelete={onDelete}
          onEdit={onEdit}
          indented
        />
      ))}

      <div className="flex items-center justify-between pl-4 pt-0.5">
        {isReplying ? (
          <div className="relative mt-1 flex-1">
            {mentionCandidates.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-24 overflow-y-auto rounded-lg border border-slate-200 bg-white p-0.5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {mentionCandidates.map((email) => (
                  <button
                    key={email}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectMention(email);
                    }}
                    className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-slate-700 dark:hover:text-orange-300"
                  >
                    @{email}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <textarea
                ref={replyInputRef}
                autoFocus
                rows={1}
                value={replyDraft}
                onChange={handleReplyChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitReply();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setReplyMentionQuery(null);
                  }
                }}
                placeholder="Write a reply… (@ to mention)"
                className="min-w-0 flex-1 resize-none rounded border border-slate-200 bg-white px-1.5 py-1 text-xs outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={submitReply}
                className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-orange-600"
              >
                Reply
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsReplying(true)}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400 cursor-pointer"
            >
              <CornerDownRight className="h-3 w-3" />
              Reply
            </button>

            {replies.length > 0 && onResolveThread && (
              <button
                type="button"
                onClick={() => onResolveThread(comment.id, !allResolved)}
                title={allResolved ? "Reopen entire thread" : "Resolve entire thread"}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
              >
                <CheckCheck className="h-3 w-3" />
                {allResolved ? "Reopen thread" : "Resolve all"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CommentThreadItem;
