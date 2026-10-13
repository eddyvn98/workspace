"use client";

import React from "react";

interface CommentComposerInputProps {
  inputRef: React.Ref<HTMLInputElement>;
  draft: string;
  mentionCandidates: string[];
  highlightIndex: number;
  isSubmitting: boolean;
  onDraftChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectMention: (email: string) => void;
  onSubmit: () => void;
}

export function CommentComposerInput({
  inputRef,
  draft,
  mentionCandidates,
  highlightIndex,
  isSubmitting,
  onDraftChange,
  onKeyDown,
  onSelectMention,
  onSubmit,
}: CommentComposerInputProps) {
  return (
    <div className="relative mt-2.5 flex gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
      {mentionCandidates.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-32 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
          {mentionCandidates.map((email, idx) => (
            <button
              key={email}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectMention(email);
              }}
              className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                idx === highlightIndex
                  ? "bg-orange-50 font-medium text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
              }`}
            >
              <span className="font-semibold text-orange-500 dark:text-orange-400">@</span>
              {email}
            </button>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={onDraftChange}
        onKeyDown={onKeyDown}
        placeholder="Add a comment... (@ to mention)"
        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-800 outline-none transition focus:border-orange-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-orange-500"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting || !draft.trim()}
        className="rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-600 active:scale-95 disabled:opacity-40"
      >
        {isSubmitting ? "..." : "Post"}
      </button>
    </div>
  );
}

export default CommentComposerInput;
