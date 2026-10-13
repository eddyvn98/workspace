"use client";

import React, { useState } from "react";
import { Check, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useWorkspaceStore } from "../store/useWorkspaceStore";
import type { WorkspaceComment } from "../hooks/workspaceCommentApi";

function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function WorkspaceCommentRow({
  comment,
  onToggleResolved,
  onDelete,
  onEdit,
  indented,
}: {
  comment: WorkspaceComment;
  onToggleResolved: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, body: string) => void;
  indented?: boolean;
}) {
  const currentUserEmail = useWorkspaceStore((state) => state.currentUserEmail);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const username = comment.authorEmail ? comment.authorEmail.split("@")[0] : "Anonymous";
  const isOwn = Boolean(currentUserEmail) && currentUserEmail?.toLowerCase() === comment.authorEmail.toLowerCase();
  const isEdited = comment.updatedAt && comment.createdAt && comment.updatedAt !== comment.createdAt;
  const timeStr = formatTime(comment.createdAt);

  const saveEdit = () => {
    const body = draft.trim();
    if (!body) return;
    onEdit(comment.id, body);
    setIsEditing(false);
  };

  return (
    <div className={`rounded-xl border p-2.5 text-xs transition ${comment.resolved
      ? "border-slate-100 bg-slate-50/70 text-slate-400 dark:border-slate-800 dark:bg-slate-800/40"
      : "border-slate-200/80 bg-white text-slate-700 shadow-xs dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-200"
      } ${indented ? "ml-4 border-l-2 border-l-orange-400/60 dark:border-l-orange-500/60" : ""}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
            {username.charAt(0).toUpperCase() || "?"}
          </span>
          <span className="truncate font-semibold text-slate-800 dark:text-slate-100" title={comment.authorEmail}>{username}</span>
          {timeStr && <span className="shrink-0 text-[10px] text-slate-400">{timeStr}</span>}
          {isEdited && <span className="shrink-0 text-[9px] text-slate-400">(edited)</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" title={comment.resolved ? "Reopen comment" : "Mark resolved"} aria-label={comment.resolved ? "Reopen comment" : "Mark resolved"} onClick={() => onToggleResolved(comment.id, !comment.resolved)} className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-700 dark:hover:text-emerald-400">
            {comment.resolved ? <RotateCcw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          </button>
          {isOwn && !isEditing && <button type="button" title="Edit comment" aria-label="Edit comment" onClick={() => { setDraft(comment.body); setIsEditing(true); }} className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700 dark:hover:text-blue-400"><Pencil className="h-3 w-3" /></button>}
          <button type="button" title="Delete comment" aria-label="Delete comment" onClick={() => onDelete(comment.id)} className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {isEditing ? (
        <div className="mt-1 flex gap-1">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} autoFocus className="min-w-0 flex-1 resize-none rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] outline-none dark:border-slate-700 dark:bg-slate-900" />
          <div className="flex shrink-0 flex-col gap-1">
            <button type="button" onClick={saveEdit} disabled={!draft.trim()} className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold text-white disabled:opacity-40">Save</button>
            <button type="button" onClick={() => setIsEditing(false)} aria-label="Cancel edit" className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="mx-auto h-3 w-3" /></button>
          </div>
        </div>
      ) : (
        <p className={`whitespace-pre-wrap leading-relaxed ${comment.resolved ? "line-through opacity-60" : ""}`}>{comment.body}</p>
      )}
    </div>
  );
}
