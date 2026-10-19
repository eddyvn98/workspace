// @vitest-environment jsdom
import { expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { DocImageSchema } from "@/app/workspace/extensions/docImageSchema";

it("preserves original download, caption, alt, alignment and percent width across HTML reload", () => {
  const input = '<img src="/api/workspace-images/display" data-download-url="/api/workspace-images/original" data-caption="A &amp; B" alt="Accessible description" title="Title" data-align="right" data-width="65%">';
  const editor = new Editor({ extensions: [StarterKit, DocImageSchema], content: input });
  const html = editor.getHTML();
  editor.commands.setContent(html);
  expect(editor.state.doc.firstChild!.attrs).toMatchObject({ src: "/api/workspace-images/display", downloadUrl: "/api/workspace-images/original", caption: "A & B", alt: "Accessible description", title: "Title", align: "right", width: "65%" });
  editor.destroy();
});

it("rejects unsafe image URLs and CSS-like dimensions without breaking valid images", () => {
  const editor = new Editor({ extensions: [StarterKit, DocImageSchema], content: '<img src="javascript:alert(1)"><img src="data:image/png;base64,AAAA"><img src="/safe.png" data-download-url="javascript:alert(2)" data-width="url(evil)" data-align="position:fixed">' });
  const imageNodes: unknown[] = []; editor.state.doc.descendants((node) => { if (node.type.name === "image") imageNodes.push(node.attrs); });
  expect(imageNodes).toHaveLength(1);
  expect(imageNodes[0]).toMatchObject({ src: "/safe.png", downloadUrl: null, width: "100%", align: "center" });
  expect(editor.getHTML()).not.toMatch(/javascript|base64|position:fixed|url\(evil\)/);
  editor.destroy();
});
