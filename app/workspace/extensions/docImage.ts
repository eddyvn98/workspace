import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { WorkspaceDocImageNodeView } from "../components/WorkspaceDocImageNodeView";

/** The doc block's image node — @tiptap/extension-image with a React
 *  NodeView (WorkspaceDocImageNodeView.tsx) swapped in so a selected image
 *  shows its own floating Replace/Download/Delete toolbar, matching how a
 *  standalone `image` canvas block behaves. Base64 stays disabled: doc
 *  images always go through uploadWorkspaceImageWithOriginal first, same as
 *  every other image in this app. */
export const DocImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Percentage of the doc's content width, and which side of the line
      // it sits against — both round-trip through the persisted HTML via
      // data-* attributes since the NodeView (not the HTML) owns the actual
      // flex/width layout on reload.
      width: {
        default: "100%",
        parseHTML: (element) => element.getAttribute("data-width") ?? "100%",
        renderHTML: (attributes) => ({ "data-width": attributes.width }),
      },
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align") ?? "center",
        renderHTML: (attributes) => ({ "data-align": attributes.align }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(WorkspaceDocImageNodeView);
  },
}).configure({ allowBase64: false, inline: false });

export default DocImage;
