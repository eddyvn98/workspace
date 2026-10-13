import { attrValue, parseHtml, walkNodes } from "./docHtmlParse";
import { safeSlideImageUrl } from "./slideLayouts";

/** Reuse the document parser so compact reads retain actual uploaded image references. */
export function slideImageAssets(html: string): Array<{ src: string; alt?: string }> {
  const images: Array<{ src: string; alt?: string }> = [];
  walkNodes(parseHtml(html), (node) => {
    if (node.tag !== "img") return;
    const src = safeSlideImageUrl(attrValue(node, "src"));
    if (!src) return;
    const alt = attrValue(node, "alt");
    images.push({ src, ...(alt ? { alt } : {}) });
  });
  return images;
}
