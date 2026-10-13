"use client";

import React, { useMemo, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import { addBoardComment, deleteBoardComment, setCommentResolved, type WorkspaceComment, updateBoardComment } from "../hooks/workspaceCommentApi";
import { CommentThreadItem } from "./CommentThreadItem";
import { workspaceKeyboardScope } from "../utils/workspaceKeyboardScope";

const CANVAS_COMMENT_BLOCK_ID = "__canvas__";

function blockLabel(block: ReturnType<typeof useWorkspaceStore.getState>["blocks"][string] | undefined): string {
  const data = block?.data as { markdown?: string; label?: string; title?: string } | undefined;
  return data?.markdown || data?.label || data?.title || block?.type || "Block";
}

export function WorkspaceCommentsPanel({ onClose }: { onClose: () => void }) {
  const boardId = useWorkspaceStore((state) => state.boardId);
  const blocks = useWorkspaceStore((state) => state.blocks);
  const comments = useWorkspaceStore((state) => state.comments);
  const setComments = useWorkspaceStore((state) => state.setComments);
  const [showResolved, setShowResolved] = useState(false);
  const [draft, setDraft] = useState("");

  const participants = useMemo(
    () => Array.from(new Set(comments.map((comment) => comment.authorEmail).filter(Boolean))),
    [comments],
  );
  const threads = useMemo(() => {
    const grouped = new Map<string, WorkspaceComment[]>();
    for (const comment of comments) {
      if (!showResolved && comment.resolved) continue;
      const list = grouped.get(comment.blockId) ?? [];
      list.push(comment);
      grouped.set(comment.blockId, list);
    }
    return Array.from(grouped.entries()).sort(([, a], [, b]) => a[0].createdAt.localeCompare(b[0].createdAt));
  }, [comments, showResolved]);

  const updateLocalComment = (id: string, resolved: boolean) => {
    setComments(comments.map((comment) => (comment.id === id ? { ...comment, resolved } : comment)));
    void setCommentResolved(boardId, id, resolved);
  };

  const resolveThread = (parentId: string, resolved: boolean) => {
    const ids = new Set([parentId, ...comments.filter((comment) => comment.parentId === parentId).map((comment) => comment.id)]);
    setComments(comments.map((comment) => (ids.has(comment.id) ? { ...comment, resolved } : comment)));
    for (const id of ids) void setCommentResolved(boardId, id, resolved);
  };

  const deleteComment = (id: string) => {
    setComments(comments.filter((comment) => comment.id !== id && comment.parentId !== id));
    void deleteBoardComment(boardId, id);
  };

  const editComment = async (id: string, body: string) => {
    const updated = await updateBoardComment(boardId, id, body);
    if (updated) setComments(comments.map((comment) => (comment.id === id ? updated : comment)));
  };

  const sendGeneralComment = async () => {
    const body = draft.trim();
    if (!body) return;
    const created = await addBoardComment(boardId, CANVAS_COMMENT_BLOCK_ID, body);
    if (created) {
      setComments([...comments, created]);
      setDraft("");
    }
  };

  return (
    <aside
      {...workspaceKeyboardScope("comments")}
      className="absolute bottom-0 right-[var(--workspace-chat-width,0px)] top-14 z-40 flex w-[min(300px,100vw)] min-h-0 flex-col border-l border-slate-200/70 bg-white/95 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">
        <div><div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Comments</div><div className="text-[11px] text-slate-400 dark:text-slate-500">View and manage comments on this map</div></div>
        <button type="button" onClick={onClose} title="Close comments" aria-label="Close comments" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3 select-text scrollbar-thin">
        <div className="mb-3 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
          <div className="mb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">General comment</div>
          <div className="flex gap-1.5"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendGeneralComment(); } }} placeholder="Comment on this map…" rows={1} className="min-w-0 flex-1 resize-none rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-xs outline-none focus:outline-none focus:ring-0 focus-visible:ring-0 dark:border-slate-700" /><button type="button" onClick={() => void sendGeneralComment()} disabled={!draft.trim()} className="shrink-0 rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-40">Send</button></div>
        </div>
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-slate-500 dark:text-slate-400">{threads.length} {threads.length === 1 ? "thread" : "threads"}</span><label className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500"><input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} className="h-3 w-3" />Show resolved</label></div>
        {threads.length === 0 && <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500"><MessageCircle className="h-6 w-6 opacity-40" /><p>No comments yet. Add one from a node&apos;s toolbar or the general comment box.</p></div>}
        <div className="space-y-1.5">{threads.map(([blockId, thread]) => { const topLevel = thread.filter((comment) => !comment.parentId); return topLevel.map((comment) => <div key={comment.id}><div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{blockId === CANVAS_COMMENT_BLOCK_ID ? "General" : blockLabel(blocks[blockId])}</div><CommentThreadItem comment={comment} replies={thread.filter((reply) => reply.parentId === comment.id)} participants={participants} onToggleResolved={updateLocalComment} onResolveThread={resolveThread} onDelete={deleteComment} onEdit={editComment} onReply={(parentId, body) => { void addBoardComment(boardId, blockId, body, parentId).then((created) => created && setComments([...comments, created])); }} /></div>); })}</div>
      </div>
    </aside>
  );
}

export default WorkspaceCommentsPanel;
