import { Node, ReactNodeViewRenderer, mergeAttributes } from "@tiptap/react";
import { WorkspaceDocTableNodeView } from "../components/WorkspaceDocTableNodeView";

export const DocWorkspaceTable = Node.create({
  name: "workspaceTable",
  group: "block",
  atom: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      tableId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-table-id"),
        renderHTML: (attributes: { tableId?: string | null }) => ({ "data-table-id": attributes.tableId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-workspace-table]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-workspace-table": "true" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WorkspaceDocTableNodeView);
  },
});
