import { ReactNodeViewRenderer } from "@tiptap/react";
import { WorkspaceDocImageNodeView } from "../components/WorkspaceDocImageNodeView";
import { DocImageSchema } from "./docImageSchema";

export const DocImage = DocImageSchema.extend({
  addNodeView() {
    return ReactNodeViewRenderer(WorkspaceDocImageNodeView);
  },
});

export default DocImage;
