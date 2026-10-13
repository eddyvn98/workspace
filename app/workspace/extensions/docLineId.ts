import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** Node types a doc-block line menu (⋮) can independently target — the same
 *  granularity Miro's per-row menu uses: a bare paragraph, a heading, a
 *  blockquote, or one list item (bullet/ordered/task). A list item's own
 *  inner paragraph is NOT tagged separately — the item itself is the line. */
const LINE_NODE_TYPES = new Set(["paragraph", "heading", "blockquote", "listItem", "taskItem"]);

function makeLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Every schema type in LINE_NODE_TYPES gets a `lineId` attribute rendered as
 *  `data-line-id`, plus an appendTransaction pass that assigns a fresh id to
 *  any such node missing one (freshly typed paragraphs, pasted content,
 *  nodes duplicated by useWorkspaceDocLineActions before it stamps its own
 *  new id). WorkspaceDocLineOverlay.tsx reads this attribute to find which
 *  line the pointer is over and to resolve "Copy link to block" targets. */
export const DocLineId = Extension.create({
  name: "docLineId",

  addGlobalAttributes() {
    return [
      {
        types: Array.from(LINE_NODE_TYPES),
        attributes: {
          lineId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-line-id"),
            renderHTML: (attributes) => (attributes.lineId ? { "data-line-id": attributes.lineId } : {}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("docLineId"),
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          // Splitting a node (Enter inside a paragraph/list item) copies its
          // attrs — lineId included — onto the new second half, so a fresh
          // node isn't always missing the attribute; it can just as often
          // arrive holding a COPY of an earlier line's id. Both cases need a
          // new id: track which ids have already been claimed while walking
          // the doc, and reassign on the first missing OR repeated one.
          let tr = newState.tr;
          let changed = false;
          const seenIds = new Set<string>();
          newState.doc.descendants((node: ProseMirrorNode, pos: number) => {
            if (!LINE_NODE_TYPES.has(node.type.name)) return;
            const id = node.attrs.lineId as string | null;
            if (!id || seenIds.has(id)) {
              tr = tr.setNodeAttribute(pos, "lineId", makeLineId());
              changed = true;
            } else {
              seenIds.add(id);
            }
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});

export default DocLineId;
