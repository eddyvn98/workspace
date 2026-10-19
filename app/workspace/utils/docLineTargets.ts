import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export const DOC_LINE_NODE_TYPES = new Set(["paragraph", "heading", "blockquote", "listItem", "taskItem"]);
export const DOC_LIST_ITEM_TYPES = new Set(["listItem", "taskItem"]);
export interface DocLineTarget { node: ProseMirrorNode; pos: number; parent: ProseMirrorNode; index: number }

export function isSemanticDocLine(node: ProseMirrorNode, parent: ProseMirrorNode | null): boolean {
  return DOC_LINE_NODE_TYPES.has(node.type.name) && !(node.isTextblock && parent && DOC_LIST_ITEM_TYPES.has(parent.type.name));
}

/** A list item's text belongs to the item, including legacy paragraph IDs. */
function containingListItem(doc: ProseMirrorNode, pos: number): DocLineTarget | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (DOC_LIST_ITEM_TYPES.has($pos.node(depth).type.name)) {
      return { node: $pos.node(depth), pos: $pos.before(depth), parent: $pos.node(depth - 1), index: $pos.index(depth - 1) };
    }
  }
  return null;
}

export function findDocLine(doc: ProseMirrorNode, lineId: string): DocLineTarget | null {
  let found: DocLineTarget | null = null;
  doc.descendants((node, pos, parent, index) => {
    if (found) return false;
    if (node.attrs.lineId !== lineId) return true;
    found = DOC_LIST_ITEM_TYPES.has(node.type.name)
      ? { node, pos, parent: parent ?? doc, index }
      : containingListItem(doc, pos) ?? { node, pos, parent: parent ?? doc, index };
    return false;
  });
  return found;
}

export function docLineAtPosition(doc: ProseMirrorNode, pos: number): DocLineTarget | null {
  const item = containingListItem(doc, pos);
  if (item?.node.attrs.lineId) return item;
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.attrs.lineId && DOC_LINE_NODE_TYPES.has(node.type.name)) {
      return { node, pos: $pos.before(depth), parent: $pos.node(depth - 1), index: $pos.index(depth - 1) };
    }
  }
  return null;
}

export function docLineElement(container: HTMLElement, lineId: string): HTMLElement | null {
  // IDs may come from old HTML or AI output; never interpolate them as selectors.
  return Array.from(container.querySelectorAll<HTMLElement>("[data-line-id]")).find((element) => element.getAttribute("data-line-id") === lineId) ?? null;
}

export function docLineLink(currentUrl: string, boardId: string | null, blockId: string, lineId: string): string | null {
  if (!boardId || !blockId || !lineId) return null;
  const url = new URL("/workspace", currentUrl);
  url.searchParams.set("id", boardId);
  url.searchParams.set("focusBlock", blockId);
  url.searchParams.set("focusLine", lineId);
  return url.toString();
}
