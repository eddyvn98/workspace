// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";
import { SLIDE_LAYOUTS } from "@/app/api/workspaces/[id]/agent/slideLayouts";
import { normalizeSlideDeckData } from "@/app/workspace/utils/slideDeckOps";

/** Same schema as WorkspaceDocRichEditor (the slide body editor); DocImage only adds a NodeView over Image. */
function slideEditor(html: string) {
  return new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), TaskList, TaskItem.configure({ nested: true }), TextAlign.configure({ types: ["paragraph", "heading", "listItem", "blockquote"] }), Image, TableKit],
    content: html,
  });
}

function slideHtml(params: Record<string, unknown>) {
  const board: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "t" };
  const deck = applyAgentAction(board, { type: "create_block", blockType: "slideDeck" }).ids[0];
  const result = applyAgentAction(board, { type: "add_slide", blockId: deck, ...params });
  // Persisted-and-reloaded: JSON round trip, then the renderer's normalisation.
  const data = normalizeSlideDeckData(JSON.parse(JSON.stringify(board.blocks[deck].data)));
  return { result, slide: data.slides[data.activeSlideId!], data };
}

const nodeTypes = (editor: Editor) => {
  const types: string[] = [];
  editor.state.doc.descendants((node) => { types.push(node.type.name); });
  return types;
};

describe("slide layouts", () => {
  it("covers every documented layout", () => {
    expect([...SLIDE_LAYOUTS]).toEqual(["title", "title-bullets", "two-column", "image-caption", "section", "blank", "agenda", "quote", "stats", "process", "comparison", "closing", "data-table", "bar-chart"]);
  });

  it("title: h1 plus subtitle survive the editor schema", () => {
    const { slide } = slideHtml({ layout: "title", title: "Q3 <review>", subtitle: "Team & goals" });
    expect(slide.name).toBe("Q3 <review>");
    const editor = slideEditor(slide.html);
    expect(editor.getHTML()).toBe("<h1>Q3 &lt;review&gt;</h1><p>Team &amp; goals</p>");
    editor.destroy();
  });

  it("title-bullets: bullet list is kept as a real list", () => {
    const { slide } = slideHtml({ layout: "title-bullets", title: "Agenda", bullets: ["Intro", "Numbers", "Next steps"] });
    const editor = slideEditor(slide.html);
    const types = nodeTypes(editor);
    expect(types.filter((type) => type === "listItem")).toHaveLength(3);
    expect(types).toContain("bulletList");
    expect(editor.getHTML()).toBe(slide.html);
    editor.destroy();
  });

  it("two-column: a one-row table with a list in each cell", () => {
    const { slide } = slideHtml({ layout: "two-column", title: "Compare", left: ["Fast", "Cheap"], right: "Slow\nPricey" });
    const editor = slideEditor(slide.html);
    const types = nodeTypes(editor);
    expect(types.filter((type) => type === "tableRow")).toHaveLength(1);
    expect(types.filter((type) => type === "tableCell")).toHaveLength(2);
    expect(types.filter((type) => type === "listItem")).toHaveLength(4);
    editor.destroy();
  });

  it("image-caption: image and caption are kept; an unsafe url adds a note and no image", () => {
    const ok = slideHtml({ layout: "image-caption", title: "Chart", imageUrl: "https://example.com/a.png", caption: "Revenue" });
    const editor = slideEditor(ok.slide.html);
    expect(nodeTypes(editor)).toContain("image");
    expect(editor.getHTML()).toContain('src="https://example.com/a.png"');
    editor.destroy();
    const bad = slideHtml({ layout: "image-caption", title: "Chart", imageUrl: "javascript:alert(1)", caption: "x" });
    expect(bad.slide.html).not.toContain("<img");
    expect(bad.result.notes?.join(" ")).toContain("imageUrl");
  });

  it("section and blank layouts", () => {
    const section = slideHtml({ layout: "section", title: "Part 2", subtitle: "Details" });
    const editor = slideEditor(section.slide.html);
    expect(nodeTypes(editor)).toEqual(expect.arrayContaining(["heading", "horizontalRule", "paragraph"]));
    editor.destroy();
    expect(slideHtml({ layout: "blank", name: "Empty" }).slide.html).toBe("");
  });

  it("rejects an unknown layout with a reason and html wins over layout", () => {
    const board: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "t" };
    const deck = applyAgentAction(board, { type: "create_block", blockType: "slideDeck" }).ids[0];
    const bad = applyAgentAction(board, { type: "add_slide", blockId: deck, layout: "carousel" });
    expect(bad.ids).toEqual([]);
    expect(bad.reason).toContain("title-bullets");
    const both = slideHtml({ layout: "title", title: "X", html: "<p>Mine</p>" });
    expect(both.slide.html).toBe("<p>Mine</p>");
    expect(both.result.notes?.join(" ")).toContain("layout ignored");
  });

  it("update_slide can re-apply a layout to an existing slide", () => {
    const board: AgentBoardState = { blocks: {}, blockOrder: [], connectors: {}, title: "t" };
    const deck = applyAgentAction(board, { type: "create_block", blockType: "slideDeck" }).ids[0];
    const first = (board.blocks[deck].data as { slideOrder: string[] }).slideOrder[0];
    applyAgentAction(board, { type: "update_slide", blockId: deck, slideId: first, layout: "title-bullets", heading: "Hi", bullets: ["a"] });
    expect(normalizeSlideDeckData(JSON.parse(JSON.stringify(board.blocks[deck].data))).slides[first].html).toBe("<h2>Hi</h2><ul><li><p>a</p></li></ul>");
  });
});
