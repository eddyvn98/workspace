import type { Editor } from "@tiptap/react";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { findDocLine, type DocLineTarget } from "./docLineTargets";

export type DocLineTurnIntoKind = "paragraph" | "heading1" | "heading2" | "heading3" | "bulletList" | "orderedList" | "taskList" | "blockquote";

function parentContentStart(found: DocLineTarget): number {
  let offset = 0;
  found.parent.forEach((_child, off, idx) => { if (idx === found.index) offset = off; });
  return found.pos - offset;
}

function cloneWithoutLineIds(node: ProseMirrorNode): ProseMirrorNode {
  if (node.isText) return node;
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(cloneWithoutLineIds(child)));
  return node.type.create({ ...node.attrs, lineId: null }, Fragment.fromArray(children), node.marks);
}

export function createDocLineOperations(editor: Editor) {
  const find = (id: string) => !editor.isDestroyed && editor.isEditable ? findDocLine(editor.state.doc, id) : null;
  const turnInto = (lineId: string, kind: DocLineTurnIntoKind) => {
    const found = find(lineId);
    if (!found) return false;
    const doc = editor.state.doc;
    const selection = TextSelection.between(doc.resolve(found.pos + 1), doc.resolve(found.pos + found.node.nodeSize - 1));
    const chain = editor.chain().focus().setTextSelection({ from: selection.from, to: selection.to }).clearNodes();
    switch (kind) {
      case "paragraph": return chain.setParagraph().run();
      case "heading1": return chain.setHeading({ level: 1 }).run();
      case "heading2": return chain.setHeading({ level: 2 }).run();
      case "heading3": return chain.setHeading({ level: 3 }).run();
      case "bulletList": return chain.toggleBulletList().run();
      case "orderedList": return chain.toggleOrderedList().run();
      case "taskList": return chain.toggleTaskList().run();
      case "blockquote": return chain.toggleBlockquote().run();
    }
  };

  const duplicate = (lineId: string) => {
    const found = find(lineId);
    if (!found) return false;
    editor.view.dispatch(editor.state.tr.insert(found.pos + found.node.nodeSize, cloneWithoutLineIds(found.node)));
    return true;
  };

  const swap = (lineId: string, direction: "up" | "down") => {
    const found = find(lineId);
    if (!found) return false;
    const siblingIndex = direction === "up" ? found.index - 1 : found.index + 1;
    if (siblingIndex < 0 || siblingIndex >= found.parent.childCount) return false;
    const start = parentContentStart(found);
    let siblingOffset = 0;
    found.parent.forEach((_child, off, idx) => { if (idx === siblingIndex) siblingOffset = off; });
    const sibling = found.parent.child(siblingIndex);
    const lowFirst = siblingIndex < found.index;
    const [lowNode, highNode] = lowFirst ? [sibling, found.node] : [found.node, sibling];
    const from = start + (lowFirst ? siblingOffset : found.pos - start);
    const tr = editor.state.tr.replaceWith(from, from + lowNode.nodeSize + highNode.nodeSize, Fragment.fromArray([highNode, lowNode]));
    const nextPos = lowFirst ? from : from + sibling.nodeSize;
    tr.setSelection(TextSelection.near(tr.doc.resolve(nextPos + 1)));
    editor.view.dispatch(tr);
    return true;
  };

  const remove = (lineId: string) => {
    const found = find(lineId);
    if (!found) return false;
    if (found.parent === editor.state.doc && found.parent.childCount <= 1) return editor.commands.clearContent();
    // Empty list/quote wrappers can go. Table cells must keep their structure:
    // ProseMirror fills a required text block after its contents are deleted.
    const removableWrapper = ["bulletList", "orderedList", "taskList", "blockquote"].includes(found.parent.type.name);
    const from = found.parent.childCount <= 1 && removableWrapper ? parentContentStart(found) - 1 : found.pos;
    const size = found.parent.childCount <= 1 && removableWrapper ? found.parent.nodeSize : found.node.nodeSize;
    editor.view.dispatch(editor.state.tr.delete(from, from + size));
    return true;
  };
  return { turnInto, duplicate, moveUp: (id: string) => swap(id, "up"), moveDown: (id: string) => swap(id, "down"), remove };
}
