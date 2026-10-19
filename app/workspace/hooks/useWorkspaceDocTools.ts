"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { createDocSearchPlugin, DocSearchPluginKey, findDocMatches, getDocCounts, getDocOutline, replaceDocMatches } from "../utils/workspaceDocSearch";

export function useWorkspaceDocTools(editor: Editor, searchOpen: boolean, readOnly: boolean) {
  const [doc, setDoc] = useState(editor.state.doc);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setDoc(editor.state.doc);
    const update = () => setDoc(editor.state.doc);
    editor.on("transaction", update);
    editor.registerPlugin(createDocSearchPlugin());
    return () => {
      editor.off("transaction", update);
      if (!editor.isDestroyed) editor.unregisterPlugin(DocSearchPluginKey);
    };
  }, [editor]);
  const matches = useMemo(() => findDocMatches(doc, query, caseSensitive), [doc, query, caseSensitive]);
  const outline = useMemo(() => getDocOutline(doc), [doc]);
  const counts = useMemo(() => getDocCounts(doc), [doc]);
  const index = Math.min(active, Math.max(0, matches.length - 1));
  useEffect(() => {
    setActive(0); setNotice("");
    const first = searchOpen ? findDocMatches(editor.state.doc, query, caseSensitive)[0] : null;
    if (first) editor.chain().setTextSelection(first).scrollIntoView().run();
  }, [editor, query, caseSensitive, searchOpen]);
  useEffect(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(DocSearchPluginKey, { matches: searchOpen ? matches : [], active: index }));
  }, [editor, matches, searchOpen, index]);

  const navigate = useCallback((direction: number) => {
    if (!matches.length) return;
    const next = (index + direction + matches.length) % matches.length;
    setActive(next);
    editor.chain().setTextSelection(matches[next]).scrollIntoView().run();
  }, [editor, index, matches]);
  const replace = (all: boolean) => {
    if (readOnly) return;
    const count = replaceDocMatches(editor, all ? matches : matches[index] ? [matches[index]] : [], replacement);
    if (count && !all) {
      const latest = findDocMatches(editor.state.doc, query, caseSensitive);
      const next = latest.findIndex(match => match.from >= matches[index].from + replacement.length);
      setActive(next < 0 ? 0 : next);
    }
    setNotice(count ? `${count} ${count === 1 ? "match" : "matches"} replaced.` : "Content changed. Search again before replacing.");
  };
  const jumpToHeading = (pos: number) => editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run();

  return { query, setQuery, replacement, setReplacement, caseSensitive, setCaseSensitive, matches, index, navigate, replace, notice, outline, counts, jumpToHeading };
}
