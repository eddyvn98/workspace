import { ReactNodeViewRenderer } from "@tiptap/react";
import { WorkspaceDocTableNodeView } from "../components/WorkspaceDocTableNodeView";
import { DocWorkspaceTableSchema } from "./docEmbedSchema";

export const DocWorkspaceTable = DocWorkspaceTableSchema.extend<{ readOnly: boolean }>({
  addOptions() { return { ...this.parent?.(), readOnly: false }; },
  addNodeView() {
    return ReactNodeViewRenderer(WorkspaceDocTableNodeView);
  },
});
