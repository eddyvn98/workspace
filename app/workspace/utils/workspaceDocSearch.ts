import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface DocSearchMatch { from: number; to: number; text: string }
export interface DocOutlineEntry { pos: number; level: number; title: string }

/** Search contiguous text, including runs split by marks; never cross an atom or paragraph. */
export function findDocMatches(doc: ProseMirrorNode, query: string, caseSensitive = false): DocSearchMatch[] {
  if (!query) return [];
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), caseSensitive ? "gu" : "giu");
  const matches: DocSearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    let text = "";
    let start = pos + 1;
    const flush = () => {
      for (const match of text.matchAll(expression)) matches.push({ from: start + match.index!, to: start + match.index! + match[0].length, text: match[0] });
      text = "";
    };
    node.forEach((child, offset) => {
      if (!child.isText) { flush(); return; }
      if (!text) start = pos + 1 + offset;
      text += child.text || "";
    });
    flush();
    return false;
  });
  return matches;
}

export function getDocOutline(doc: ProseMirrorNode): DocOutlineEntry[] {
  const headings: DocOutlineEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") headings.push({ pos, level: Number(node.attrs.level) || 1, title: node.textContent.trim() || "Untitled heading" });
  });
  return headings;
}

export function getDocCounts(doc: ProseMirrorNode): { words: number; characters: number } {
  const text = doc.textBetween(0, doc.content.size, "\n", "\n");
  return { words: text.trim().match(/\S+/gu)?.length || 0, characters: Array.from(text).length };
}

/** One transaction makes Replace all one undo step. Strings remain literal text, never HTML. */
export function replaceDocMatches(editor: Editor, matches: DocSearchMatch[], replacement: string): number {
  if (!editor.isEditable || !matches.length) return 0;
  const doc = editor.state.doc;
  if (matches.some(match => match.from < 0 || match.to > doc.content.size || doc.textBetween(match.from, match.to, "", "\uFFFC") !== match.text)) return 0;
  const transaction = editor.state.tr;
  for (const match of [...matches].sort((a, b) => b.from - a.from)) transaction.insertText(replacement, match.from, match.to);
  editor.view.dispatch(transaction);
  return matches.length;
}

export const DocSearchPluginKey = new PluginKey<DecorationSet>("workspaceDocSearch");

export function createDocSearchPlugin() {
  return new Plugin<DecorationSet>({
    key: DocSearchPluginKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (transaction, previous) => {
        const search = transaction.getMeta(DocSearchPluginKey) as { matches: DocSearchMatch[]; active: number } | undefined;
        if (!search) return previous.map(transaction.mapping, transaction.doc);
        return DecorationSet.create(transaction.doc, search.matches.map((match, index) => Decoration.inline(match.from, match.to, {
          class: index === search.active ? "workspace-doc-search-hit workspace-doc-search-active" : "workspace-doc-search-hit",
        })));
      },
    },
    props: { decorations: state => DocSearchPluginKey.getState(state) },
  });
}
