"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useSearchReplace, type UseSearchReplaceReturn } from "../hooks/useSearchReplace";

export interface SearchReplacePanelProps {
  search?: UseSearchReplaceReturn;
}

export function SearchReplacePanel({ search: propSearch }: SearchReplacePanelProps = {}) {
  const localSearch = useSearchReplace();
  const search = propSearch ?? localSearch;

  const {
    isOpen,
    close,
    query,
    setQuery,
    replacement,
    setReplacement,
    matches,
    matchIndex,
    next,
    prev,
    replaceCurrent,
    replaceAll,
  } = search;

  const queryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      queryInputRef.current?.focus();
      queryInputRef.current?.select();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const matchLabel =
    matches.length === 0
      ? "0 of 0 matches"
      : `${matchIndex + 1} of ${matches.length} matches`;

  const isCurrentUrl = matches[matchIndex]?.field === "url";

  const handleQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        prev();
      } else {
        next();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const handleReplacementKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      replaceCurrent();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  return (
    <div
      role="search"
      aria-label="Find and replace"
      className="fixed top-28 right-6 z-20 flex w-80 flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-4 text-slate-800 shadow-xl backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-200"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between border-b border-slate-200 pb-1.5 dark:border-slate-800">
        <span className="text-xs font-bold text-slate-550 dark:text-slate-400">Find &amp; Replace</span>
        <button
          type="button"
          onClick={close}
          aria-label="Close find and replace"
          className="rounded p-0.5 text-slate-450 hover:text-slate-755 dark:text-slate-500 dark:hover:text-slate-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-2">
        <input
          ref={queryInputRef}
          type="text"
          placeholder="Search keyword..."
          aria-label="Find text in mindmap"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleQueryKeyDown}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      {matches.length > 0 && (
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>{matchLabel}</span>
          <div className="flex gap-1">
            <button onClick={prev} disabled={matches.length === 0} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">Prev</button>
            <button onClick={next} disabled={matches.length === 0} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">Next</button>
          </div>
        </div>
      )}

      <div className="mt-1 flex gap-2">
        <input
          type="text"
          placeholder="Replace with..."
          aria-label="Replace with"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={handleReplacementKeyDown}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={replaceCurrent}
          disabled={matches.length === 0 || isCurrentUrl}
          className="rounded-lg bg-slate-105 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-30 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Replace
        </button>
        <button
          type="button"
          onClick={replaceAll}
          disabled={matches.length === 0}
          className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-650 hover:bg-orange-500/20 disabled:opacity-30 dark:bg-orange-950/30 dark:text-orange-400 dark:hover:bg-orange-950/50"
        >
          Replace All
        </button>
      </div>
    </div>
  );
}

export default SearchReplacePanel;
