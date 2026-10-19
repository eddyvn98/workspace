import Image from "@tiptap/extension-image";
import { docImageAlign, docImageWidth, safeDocImageUrl } from "../utils/docImageAttributes";

/** Shared by the editor and server-side HTML/Yjs conversion; no React UI. */
export const DocImageSchema = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) => safeDocImageUrl(element.getAttribute("src")),
        renderHTML: (attributes) => ({ src: safeDocImageUrl(attributes.src) ?? "" }),
      },
      downloadUrl: {
        default: null,
        parseHTML: (element) => safeDocImageUrl(element.getAttribute("data-download-url")),
        renderHTML: (attributes) => {
          const url = safeDocImageUrl(attributes.downloadUrl);
          return url ? { "data-download-url": url } : {};
        },
      },
      caption: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-caption") ?? "",
        renderHTML: (attributes) => attributes.caption ? { "data-caption": String(attributes.caption) } : {},
      },
      // Percentage of the doc's content width, and which side of the line
      // it sits against — both round-trip through the persisted HTML via
      // data-* attributes since the NodeView (not the HTML) owns the actual
      // flex/width layout on reload.
      width: {
        default: "100%",
        parseHTML: (element) => docImageWidth(element.getAttribute("data-width")),
        renderHTML: (attributes) => ({ "data-width": docImageWidth(attributes.width) }),
      },
      align: {
        default: "center",
        parseHTML: (element) => docImageAlign(element.getAttribute("data-align")),
        renderHTML: (attributes) => ({ "data-align": docImageAlign(attributes.align) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "img[src]", getAttrs: (element) => safeDocImageUrl(element.getAttribute("src")) ? null : false }];
  },
}).configure({ allowBase64: false, inline: false });

export default DocImageSchema;
