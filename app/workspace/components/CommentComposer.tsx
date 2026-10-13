"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { addBoardComment, deleteBoardComment, setCommentResolved, updateBoardComment } from "../hooks/workspaceCommentApi";
import { fetchBoardShares } from "../hooks/workspaceShareApi";
import { useWorkspaceRemoteBoardId } from "../hooks/useWorkspaceRemoteBoardId";
import { CommentThreadItem } from "./CommentThreadItem";
import { CommentComposerInput } from "./CommentComposerInput";
import { workspaceKeyboardScope } from "../utils/workspaceKeyboardScope";

const MENTION_TRIGGER = /(?:^|\s)@([a-zA-Z0-9._%+-]*)$/;

export function CommentComposer() {
  const boardId = useWorkspaceStore((state) => state.boardId);
  const remoteBoardId = useWorkspaceRemoteBoardId(boardId);
  const activeBlockId = useWorkspaceStore((state) => state.activeCommentBlockId);
  const setActiveCommentBlockId = useWorkspaceStore((state) => state.setActiveCommentBlockId);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const comments = useWorkspaceStore((state) => state.comments);
  const setComments = useWorkspaceStore((state) => state.setComments);

  const [draft, setDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sharedParticipants, setSharedParticipants] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Click-away to close composer
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveCommentBlockId(null);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [setActiveCommentBlockId]);

  useEffect(() => {
    if (!remoteBoardId) {
      setSharedParticipants([]);
      return;
    }
    let cancelled = false;
    void fetchBoardShares(remoteBoardId).then((shares) => {
      if (cancelled) return;
      const emails = new Set<string>();
      for (const share of shares) {
        if (share.invitedEmail?.trim()) emails.add(share.invitedEmail.trim());
        if (share.invitedBy?.trim()) emails.add(share.invitedBy.trim());
      }
      setSharedParticipants(Array.from(emails));
    });
    return () => {
      cancelled = true;
    };
  }, [remoteBoardId]);

  const participants = useMemo(() => {
    const emails = new Set(sharedParticipants);
    for (const comment of comments) {
      if (comment.authorEmail?.trim()) emails.add(comment.authorEmail.trim());
    }
    return Array.from(emails);
  }, [comments, sharedParticipants]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return participants.filter((email) => email.toLowerCase().includes(query));
  }, [mentionQuery, participants]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [mentionQuery]);

  if (!activeBlockId) return null;

  const targetBlock = blocks[activeBlockId];
  const blockLabel =
    targetBlock &&
    typeof (targetBlock.data as { markdown?: string; label?: string; title?: string })?.markdown === "string"
      ? (targetBlock.data as { markdown: string }).markdown
      : (targetBlock?.data as { label?: string; title?: string })?.label ||
        (targetBlock?.data as { label?: string; title?: string })?.title ||
        targetBlock?.type ||
        "Block";

  const threadComments = comments.filter((c) => c.blockId === activeBlockId);
  const topLevelComments = threadComments.filter((c) => !c.parentId);
  const repliesByParentId = new Map<string, typeof threadComments>();
  for (const c of threadComments) {
    if (!c.parentId) continue;
    const list = repliesByParentId.get(c.parentId) ?? [];
    list.push(c);
    repliesByParentId.set(c.parentId, list);
  }

  const handleAdd = async () => {
    const body = draft.trim();
    if (!body || isSubmitting) return;
    setIsSubmitting(true);
    const created = await addBoardComment(boardId, activeBlockId, body);
    setIsSubmitting(false);
    if (created) {
      setDraft("");
      setMentionQuery(null);
      setComments([...comments, created]);
    }
  };

  const handleReply = async (parentId: string, body: string) => {
    const created = await addBoardComment(boardId, activeBlockId, body, parentId);
    if (created) {
      setComments([...comments, created]);
    }
  };

  const handleToggleResolved = (id: string, resolved: boolean) => {
    setComments(comments.map((c) => (c.id === id ? { ...c, resolved } : c)));
    void setCommentResolved(boardId, id, resolved);
  };

  const handleEdit = async (id: string, body: string) => {
    const updated = await updateBoardComment(boardId, id, body);
    if (updated) setComments(comments.map((comment) => (comment.id === id ? updated : comment)));
  };

  const handleResolveThread = (parentId: string, resolved: boolean) => {
    const affectedIds = new Set<string>([parentId]);
    const childReplies = repliesByParentId.get(parentId) ?? [];
    for (const r of childReplies) affectedIds.add(r.id);

    setComments(comments.map((c) => (affectedIds.has(c.id) ? { ...c, resolved } : c)));
    for (const id of affectedIds) {
      void setCommentResolved(boardId, id, resolved);
    }
  };

  const handleDelete = (id: string) => {
    setComments(comments.filter((c) => c.id !== id && c.parentId !== id));
    void deleteBoardComment(boardId, id);
  };

  const handleDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setDraft(value);
    const match = MENTION_TRIGGER.exec(value.slice(0, cursor));
    setMentionQuery(match ? match[1] : null);
  };

  const selectMention = (email: string) => {
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? draft.length;
    const textBeforeCursor = draft.slice(0, cursor);
    const textAfterCursor = draft.slice(cursor);
    const replacedBefore = textBeforeCursor.replace(/(?:^|\s)@([a-zA-Z0-9._%+-]*)$/, (m) =>
      m.startsWith(" ") ? ` @${email} ` : `@${email} `
    );
    setDraft(replacedBefore + textAfterCursor);
    setMentionQuery(null);

    if (input) {
      input.focus();
      const newCursor = replacedBefore.length;
      setTimeout(() => {
        input.setSelectionRange(newCursor, newCursor);
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionCandidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const candidate = mentionCandidates[highlightIndex] ?? mentionCandidates[0];
        if (candidate) {
          selectMention(candidate);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setActiveCommentBlockId(null);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      void handleAdd();
    }
  };

  return (
    <div
      ref={containerRef}
      {...workspaceKeyboardScope("comment-composer")}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="absolute right-4 top-24 z-50 flex w-80 max-h-[520px] flex-col rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
    >
      <div className="mb-2.5 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 text-orange-500 shrink-0" />
          <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
            Comments on &ldquo;{blockLabel}&rdquo;
          </span>
          {threadComments.length > 0 && (
            <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 dark:bg-orange-950 dark:text-orange-300 shrink-0">
              {threadComments.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setActiveCommentBlockId(null)}
          title="Close comments (Esc)"
          aria-label="Close"
          className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {topLevelComments.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
            <MessageSquare className="mx-auto mb-1.5 h-6 w-6 text-slate-300 dark:text-slate-600" />
            <p className="font-medium text-slate-600 dark:text-slate-400">No comments on this block yet</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Leave a note or type @ to mention someone.</p>
          </div>
        ) : (
          topLevelComments.map((comment) => (
            <CommentThreadItem
              key={comment.id}
              comment={comment}
              replies={repliesByParentId.get(comment.id) ?? []}
              participants={participants}
              onToggleResolved={handleToggleResolved}
              onResolveThread={handleResolveThread}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onReply={handleReply}
            />
          ))
        )}
      </div>

      <CommentComposerInput
        inputRef={inputRef}
        draft={draft}
        mentionCandidates={mentionCandidates}
        highlightIndex={highlightIndex}
        isSubmitting={isSubmitting}
        onDraftChange={handleDraftChange}
        onKeyDown={handleKeyDown}
        onSelectMention={selectMention}
        onSubmit={handleAdd}
      />
    </div>
  );
}

export default CommentComposer;
