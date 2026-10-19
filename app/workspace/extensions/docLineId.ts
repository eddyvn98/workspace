import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Mapping } from "@tiptap/pm/transform";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { DOC_LINE_NODE_TYPES, isSemanticDocLine } from "../utils/docLineTargets";

/** Node types a doc-block line menu (⋮) can independently target — the same
 *  granularity Miro's per-row menu uses: a bare paragraph, a heading, a
 *  blockquote, or one list item (bullet/ordered/task). A list item's own
 *  inner paragraph is NOT tagged separately — the item itself is the line. */
const LINE_NODE_TYPES = DOC_LINE_NODE_TYPES;

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
export const DocLineId = Extension.create<{ canWrite: () => boolean }>({
  name: "docLineId",
  addOptions: () => ({ canWrite: () => true }),

  onCreate() {
    if (!this.editor.isDestroyed && this.editor.isEditable && this.options.canWrite()) {
      this.editor.view.dispatch(this.editor.state.tr.setMeta("docLineIdInitialize", true).setMeta("addToHistory", false));
    }
  },

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
          if (!this.editor.isEditable || !this.options.canWrite() || !transactions.some((tr) => tr.docChanged || tr.getMeta("docLineIdInitialize"))) return null;
          if (transactions.every((tr) => tr.getMeta(ySyncPluginKey)?.isChangeOrigin)) return null;

          // Splitting a node (Enter inside a paragraph/list item) copies its
          // attrs — lineId included — onto the new second half, so a fresh
          // node isn't always missing the attribute; it can just as often
          // arrive holding a COPY of an earlier line's id. Both cases need a
          // new id: track which ids have already been claimed while walking
          // the doc, and reassign on the first missing OR repeated one.
          let tr = newState.tr;
          let changed = false;
          const seenIds = new Set<string>();
          const mapping = new Mapping();
          transactions.forEach((transaction) => mapping.appendMapping(transaction.mapping));
          const previousOwners = new Map<string, number>();
          oldState.doc.descendants((node, pos) => {
            if (node.attrs.lineId && !previousOwners.has(node.attrs.lineId)) previousOwners.set(node.attrs.lineId, mapping.map(pos, 1));
          });
          const owners = new Map<string, number>();
          newState.doc.descendants((node, pos) => {
            const id = node.attrs.lineId;
            if (id && (!owners.has(id) || previousOwners.get(id) === pos)) owners.set(id, pos);
          });
          newState.doc.descendants((node: ProseMirrorNode, pos: number, parent) => {
            if (!LINE_NODE_TYPES.has(node.type.name)) return;
            const id = node.attrs.lineId as string | null;
            // New list paragraphs belong to their list item. Old paragraph
            // IDs remain readable so previously shared links still resolve.
            if (!id && !isSemanticDocLine(node, parent)) return;
            if (!id || seenIds.has(id) || owners.get(id) !== pos) {
              let next = makeLineId();
              while (seenIds.has(next) || owners.has(next)) next = makeLineId();
              tr = tr.setNodeAttribute(pos, "lineId", next);
              seenIds.add(next);
              changed = true;
            } else {
              seenIds.add(id);
            }
          });
          return changed ? tr.setMeta("addToHistory", false).setMeta("docLineIdRepair", true) : null;
        },
      }),
    ];
  },
});

export default DocLineId;
