"use client";

import type { Editor } from "@tiptap/react";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { toast } from "sonner";
import { useWorkspaceStore } from "../store/useWorkspaceStore";

export type DocLineTurnIntoKind =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote";

interface FoundLine {
  node: ProseMirrorNode;
  pos: number;
  parent: ProseMirrorNode;
  index: number;
}

function findLine(editor: Editor, lineId: string): FoundLine | null {
  let found: FoundLine | null = null;
  editor.state.doc.descendants((node, pos, parent, index) => {
    if (found) return false;
    if (node.attrs.lineId === lineId) {
      found = { node, pos, parent: parent ?? editor.state.doc, index };
      return false;
    }
    return true;
  });
  return found;
}

/** Position of `found`'s node within its own parent's content, i.e. the
 *  parent's content-start position — needed to locate siblings and, for
 *  `remove`, the parent node's own start/end when it must be deleted too. */
function parentContentStart(found: FoundLine): number {
  let offset = 0;
  found.parent.forEach((_child, off, idx) => {
    if (idx === found.index) offset = off;
  });
  return found.pos - offset;
}

/**
 * Node-level operations for one "line" (paragraph/heading/blockquote/list
 * item) inside a doc/slideDeck TipTap document, addressed by the stable
 * `lineId` DocLineId (../extensions/docLineId.ts) stamps on it. Mirrors
 * useBlockContextMenuActions.ts's canvas-block operations one level down,
 * inside a single doc block's rich text.
 */
export function useWorkspaceDocLineActions(editor: Editor | null, blockId: string) {
  const turnInto = (lineId: string, kind: DocLineTurnIntoKind) => {
    if (!editor) return;
    const found = findLine(editor, lineId);
    if (!found) return;
    const from = found.pos + 1;
    const to = found.pos + found.node.nodeSize - 1;
    const chain = editor.chain().focus().setTextSelection({ from, to }).clearNodes();
    switch (kind) {
      case "paragraph": chain.setParagraph().run(); break;
      case "heading1": chain.setHeading({ level: 1 }).run(); break;
      case "heading2": chain.setHeading({ level: 2 }).run(); break;
      case "heading3": chain.setHeading({ level: 3 }).run(); break;
      case "bulletList": chain.toggleBulletList().run(); break;
      case "orderedList": chain.toggleOrderedList().run(); break;
      case "taskList": chain.toggleTaskList().run(); break;
      case "blockquote": chain.toggleBlockquote().run(); break;
    }
  };

  const duplicate = (lineId: string) => {
    if (!editor) return;
    const found = findLine(editor, lineId);
    if (!found) return;
    const clone = found.node.type.create({ ...found.node.attrs, lineId: null }, found.node.content, found.node.marks);
    editor.view.dispatch(editor.state.tr.insert(found.pos + found.node.nodeSize, clone));
  };

  const swap = (lineId: string, direction: "up" | "down") => {
    if (!editor) return;
    const found = findLine(editor, lineId);
    if (!found) return;
    const siblingIndex = direction === "up" ? found.index - 1 : found.index + 1;
    if (siblingIndex < 0 || siblingIndex >= found.parent.childCount) return;

    const start = parentContentStart(found);
    let siblingOffset = 0;
    found.parent.forEach((_child, off, idx) => {
      if (idx === siblingIndex) siblingOffset = off;
    });
    const sibling = found.parent.child(siblingIndex);
    const nodeOffset = found.pos - start;

    const lowFirst = siblingIndex < found.index;
    const lowOffset = lowFirst ? siblingOffset : nodeOffset;
    const [lowNode, highNode] = lowFirst ? [sibling, found.node] : [found.node, sibling];
    const from = start + lowOffset;
    const to = from + lowNode.nodeSize + highNode.nodeSize;

    editor.view.dispatch(editor.state.tr.replaceWith(from, to, Fragment.fromArray([highNode, lowNode])));
  };

  const remove = (lineId: string) => {
    if (!editor) return;
    const found = findLine(editor, lineId);
    if (!found) return;

    if (found.parent === editor.state.doc) {
      if (editor.state.doc.childCount <= 1) {
        editor.chain().focus().clearContent().run();
        return;
      }
      editor.view.dispatch(editor.state.tr.delete(found.pos, found.pos + found.node.nodeSize));
      return;
    }

    if (found.parent.childCount <= 1) {
      // The only item in this list — remove the now-empty wrapper too,
      // since a bulletList/orderedList/taskList can't have zero children.
      const parentPos = parentContentStart(found) - 1;
      editor.view.dispatch(editor.state.tr.delete(parentPos, parentPos + found.parent.nodeSize));
      return;
    }
    editor.view.dispatch(editor.state.tr.delete(found.pos, found.pos + found.node.nodeSize));
  };

  const copyLink = async (lineId: string) => {
    if (typeof window === "undefined") return;
    const boardId = useWorkspaceStore.getState().boardId;
    const url = new URL(window.location.href);
    url.search = `?id=${boardId ?? ""}&focusBlock=${blockId}&focusLine=${lineId}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success("Link to this line copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return {
    turnInto,
    duplicate,
    moveUp: (lineId: string) => swap(lineId, "up"),
    moveDown: (lineId: string) => swap(lineId, "down"),
    remove,
    copyLink,
  };
}

export default useWorkspaceDocLineActions;
