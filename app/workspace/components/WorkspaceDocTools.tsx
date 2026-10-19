"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronDown, ChevronUp, ListTree, Search, X } from "lucide-react";
import { useWorkspaceDocTools } from "../hooks/useWorkspaceDocTools";

const buttonClass = "rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700";
const inputClass = "min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

export function WorkspaceDocTools({ editor, readOnly = false, compact = false, className = "" }: {
  editor: Editor; readOnly?: boolean; compact?: boolean; className?: string;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const outlineId = useId();
  const tools = useWorkspaceDocTools(editor, searchOpen, readOnly);

  useEffect(() => { if (searchOpen) inputRef.current?.focus(); }, [searchOpen]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as Node | null;
      if (!target || (!editor.view.dom.contains(target) && !rootRef.current?.contains(target))) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && ["f", "h"].includes(event.key.toLowerCase())) {
        event.preventDefault(); event.stopPropagation();
        setSearchOpen(true);
        if (event.key.toLowerCase() === "h" && !readOnly) setReplaceOpen(true);
        inputRef.current?.focus();
      } else if (event.key === "Escape" && rootRef.current?.contains(target) && (searchOpen || outlineOpen)) {
        event.preventDefault(); event.stopPropagation();
        setSearchOpen(false); setOutlineOpen(false); editor.commands.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  }, [editor, outlineOpen, readOnly, searchOpen]);

  return <div ref={rootRef} className={`mb-3 rounded-md border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 ${className}`}
    onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-1 p-1" role="group" aria-label="Document navigation and search">
      <button type="button" className={`${buttonClass} flex items-center gap-1`} aria-expanded={searchOpen} aria-controls={searchId}
        title="Find in document (Ctrl/Cmd+F)" onClick={() => setSearchOpen(value => !value)}><Search className="h-3.5 w-3.5" />Find</button>
      <button type="button" className={`${buttonClass} flex items-center gap-1`} aria-expanded={outlineOpen} aria-controls={outlineId}
        onClick={() => setOutlineOpen(value => !value)}><ListTree className="h-3.5 w-3.5" />Outline</button>
      <span className="ml-auto px-2 text-xs text-slate-500 dark:text-slate-300" title={`${tools.counts.characters} characters`}>
        <output aria-label="Word count">{tools.counts.words} words</output>{!compact && <> · <output aria-label="Character count">{tools.counts.characters} characters</output></>}
      </span>
    </div>
    {searchOpen && <div id={searchId} role="search" aria-label="Find and replace in document" className="space-y-2 border-t border-slate-200 p-2 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-1.5">
        <input ref={inputRef} aria-label="Find text" placeholder="Find text" maxLength={1000} className={`${inputClass} w-40 flex-1`} value={tools.query}
          onChange={event => tools.setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); tools.navigate(event.shiftKey ? -1 : 1); } }} />
        <span role="status" aria-live="polite" className="min-w-12 text-center text-xs">{tools.matches.length ? `${tools.index + 1} / ${tools.matches.length}` : tools.query ? "No matches" : ""}</span>
        <button type="button" className={buttonClass} aria-label="Previous match" disabled={!tools.matches.length} onClick={() => tools.navigate(-1)}><ChevronUp className="h-4 w-4" /></button>
        <button type="button" className={buttonClass} aria-label="Next match" disabled={!tools.matches.length} onClick={() => tools.navigate(1)}><ChevronDown className="h-4 w-4" /></button>
        <button type="button" className={buttonClass} aria-label="Close document search" onClick={() => { setSearchOpen(false); editor.commands.focus(); }}><X className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={tools.caseSensitive} onChange={event => tools.setCaseSensitive(event.target.checked)} />Match case</label>
        {!readOnly && <button type="button" className={buttonClass} aria-expanded={replaceOpen} onClick={() => setReplaceOpen(value => !value)}>Replace {replaceOpen ? "▴" : "▾"}</button>}
      </div>
      {replaceOpen && !readOnly && <div className="flex flex-wrap items-center gap-1.5">
        <input aria-label="Replace with" placeholder="Replace with" className={`${inputClass} w-40 flex-1`} value={tools.replacement} onChange={event => tools.setReplacement(event.target.value)} />
        <button type="button" className={buttonClass} disabled={!tools.matches.length || !editor.isEditable} onClick={() => tools.replace(false)}>Replace</button>
        <button type="button" className={buttonClass} disabled={!tools.matches.length || !editor.isEditable} onClick={() => tools.replace(true)}>Replace all</button>
      </div>}
      {tools.notice && <p role="status" className="text-xs text-slate-600 dark:text-slate-300">{tools.notice}</p>}
    </div>}
    {outlineOpen && <nav id={outlineId} aria-label="Document outline" className="max-h-64 overflow-y-auto border-t border-slate-200 p-2 dark:border-slate-700">
      {tools.outline.length ? <ol className="!m-0 !list-none !p-0">{tools.outline.map(heading => <li key={heading.pos} className="!m-0">
        <button type="button" className={`${buttonClass} w-full truncate text-left`} style={{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }}
          title={heading.title} onClick={() => tools.jumpToHeading(heading.pos)}>{heading.title}</button>
      </li>)}</ol> : <p className="px-2 py-1 text-xs text-slate-500 dark:text-slate-300">Add headings to build an outline.</p>}
    </nav>}
  </div>;
}
