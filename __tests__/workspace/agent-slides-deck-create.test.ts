import { findPlaceholder } from "@/app/api/workspaces/[id]/agent/slideLayoutInput";
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
import { normalizeSlideDeckData } from "@/app/workspace/utils/slideDeckOps";

function slideEditor(html: string) {
  return new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), TaskList, TaskItem.configure({ nested: true }), TextAlign.configure({ types: ["paragraph", "heading", "listItem", "blockquote"] }), Image, TableKit],
    content: html,
  });
}

const emptyBoard = (): AgentBoardState => ({ blocks: {}, blockOrder: [], connectors: {}, title: "t" });
const create = (board: AgentBoardState, action: Record<string, unknown>) => applyAgentAction(board, { type: "create_slide_deck", ...action });
const reload = (board: AgentBoardState, id: string) => normalizeSlideDeckData(JSON.parse(JSON.stringify(board.blocks[id].data)));
const nodeTypes = (editor: Editor) => {
  const types: string[] = [];
  editor.state.doc.descendants((node) => { types.push(node.type.name); });
  return types;
};

const FULL_DECK = [
  { layout: "title", title: "Q3 Review", subtitle: "Finance team", notes: "Welcome everyone." },
  { layout: "agenda", bullets: ["Results", "Risks", "Next steps"] },
  { layout: "section", title: "Results", subtitle: "What happened" },
  { layout: "title-bullets", title: "Highlights", bullets: ["Revenue up", "Costs flat"] },
  { layout: "stats", title: "Key numbers", items: [{ value: "42%", label: "Growth" }, { value: "1.2M", label: "Users" }, { value: "3x", label: "ROI" }] },
  { layout: "process", title: "Plan", steps: ["Plan", "Build", "Ship"] },
  { layout: "comparison", title: "Options", leftTitle: "A", rightTitle: "B", left: ["Fast"], right: ["Cheap"] },
  { layout: "two-column", title: "Pros and cons", left: ["Pro"], right: ["Con"] },
  { layout: "quote", text: "Make it work", author: "Team lead" },
  { layout: "image-caption", title: "Chart", imageUrl: "https://example.com/a.png", caption: "Revenue" },
  { layout: "closing", title: "Thank you", subtitle: "Questions?", bullets: ["finance@example.com"] },
];

describe("create_slide_deck", () => {
  it("creates one deck block with every slide, notes, theme and active slide, surviving a reload", () => {
    const board = emptyBoard();
    const result = create(board, { title: "Q3", slides: FULL_DECK });
    expect(result.reason).toBeUndefined();
    expect(result.ids).toHaveLength(1);
    expect(Object.keys(board.blocks)).toEqual(result.ids);
    const data = reload(board, result.ids[0]);
    expect(board.blocks[result.ids[0]].type).toBe("slideDeck");
    expect(data.slideOrder).toHaveLength(FULL_DECK.length);
    expect(data.activeSlideId).toBe(data.slideOrder[0]);
    expect(data.title).toBe("Q3");
    expect(data.theme?.preset).toBe("clean");
    expect(data.slides[data.slideOrder[0]].presenterNotes).toBe("Welcome everyone.");
    expect(data.slides[data.slideOrder[0]].name).toBe("Q3 Review");
    expect(new Set(data.slideOrder).size).toBe(FULL_DECK.length);
  });

  it("every layout renders through the real slide schema", () => {
    const board = emptyBoard();
    const id = create(board, { slides: FULL_DECK }).ids[0];
    const data = reload(board, id);
    const types = data.slideOrder.map((slideId) => {
      const editor = slideEditor(data.slides[slideId].html);
      const found = nodeTypes(editor);
      // The editor adds table attributes, so compare the text content, which must survive intact.
      const plain = (html: string) => html.replace(/<[^>]+>/g, "");
      expect(plain(editor.getHTML())).toBe(plain(data.slides[slideId].html));
      editor.destroy();
      return found;
    });
    expect(types[1]).toContain("orderedList");
    expect(types[4].filter((type) => type === "tableCell")).toHaveLength(3);
    expect(types[4]).toContain("heading");
    expect(types[5].filter((type) => type === "tableCell")).toHaveLength(3);
    expect(types[6].filter((type) => type === "tableHeader")).toHaveLength(2);
    expect(types[8]).toContain("blockquote");
    expect(types[9]).toContain("image");
    expect(types[2]).toContain("horizontalRule");
  });

  it("infers a layout when only content fields are given and defaults the first slide to title", () => {
    const board = emptyBoard();
    const id = create(board, { slides: [{ title: "Hello" }, { title: "Points", bullets: ["a", "b"] }, { title: "Cols", left: ["x"], right: ["y"] }] }).ids[0];
    const data = reload(board, id);
    expect(data.slides[data.slideOrder[0]].html).toBe("<h1>Hello</h1>");
    expect(data.slides[data.slideOrder[1]].html).toContain("<ul>");
    expect(data.slides[data.slideOrder[2]].html).toContain("<table>");
  });

  it("rejects the whole call naming the bad slide index and creates nothing", () => {
    const board = emptyBoard();
    const result = create(board, { slides: [{ layout: "title", title: "ok" }, { layout: "title-bullets", title: "x", bullets: ["fine"], backgroundColor: "not-a-colour" }] });
    expect(result.ids).toEqual([]);
    expect(result.reason).toContain("slides[1]");
    expect(board.blocks).toEqual({});
    expect(board.blockOrder).toEqual([]);
    expect(create(board, { slides: [{ layout: "nope", title: "x" }] }).reason).toContain("slides[0]");
    expect(create(board, { slides: [{ layout: "stats", title: "x", items: [{ value: "1", label: "a" }] }] }).reason).toContain("2-4 items");
    expect(create(board, { slides: [{ layout: "process", title: "x", steps: ["only"] }] }).reason).toContain("steps");
    expect(create(board, { slides: [{ layout: "quote", title: "x" }] }).reason).toContain("quote");
    expect(create(board, { slides: [{ layout: "title" }] }).reason).toContain("no content");
  });

  it("rejects placeholders instead of saving them", () => {
    const board = emptyBoard();
    for (const bad of [{ layout: "title-bullets", title: "Revenue", bullets: ["[Q3 revenue]"] }, { layout: "title", title: "Plan", subtitle: "TBD" }, { layout: "stats", title: "n", items: [{ value: "XX%", label: "a" }, { value: "1", label: "b" }] }, { layout: "title", title: "ok", notes: "[add notes]" }]) {
      const result = create(board, { slides: [bad] });
      expect(result.ids).toEqual([]);
      expect(result.reason).toContain("placeholder");
    }
    expect(create(board, { slides: [{ layout: "title-bullets", title: "Docs", bullets: ["See [link](https://x.com)"] }] }).ids).toHaveLength(1);
  });

  it("caps the deck at 60 slides and validates deck fields", () => {
    const board = emptyBoard();
    const slides = (count: number) => Array.from({ length: count }, (_, index) => ({ layout: "title", title: `Slide ${index + 1}` }));
    expect(create(board, { slides: slides(60) }).ids).toHaveLength(1);
    const over = create(board, { slides: slides(61) });
    expect(over.reason).toContain("at most 60");
    expect(over.ids).toEqual([]);
    expect(create(board, { slides: [] }).reason).toContain("non-empty");
    expect(create(board, { slides: slides(1), aspectRatio: "1:1" }).reason).toContain("aspectRatio");
    expect(create(board, { slides: slides(1), theme: { preset: "neon" } }).reason).toContain("Unknown theme preset");
    expect(create(board, { slides: slides(1), title: "  " }).reason).toContain("title");
  });

  it("applies theme presets and explicit overrides, and 4:3 sizing", () => {
    const board = emptyBoard();
    const id = create(board, { aspectRatio: "4:3", theme: { preset: "dark", accentColor: "#ff0000" }, slides: [{ layout: "title", title: "Dark" }] }).ids[0];
    const data = reload(board, id);
    expect(data.aspectRatio).toBe("4:3");
    expect(data.theme).toMatchObject({ preset: "dark", backgroundColor: "#0f172a", textColor: "#f1f5f9", accentColor: "#ff0000" });
    const custom = create(board, { theme: { backgroundColor: "#111111", textColor: "#eeeeee" }, slides: [{ layout: "title", title: "Custom" }] }).ids[0];
    expect(reload(board, custom).theme).toMatchObject({ backgroundColor: "#111111", textColor: "#eeeeee" });
    expect(reload(board, custom).theme?.preset).toBeUndefined();
  });

  it("places decks without overlapping existing blocks and supports afterBlockId", () => {
    const board = emptyBoard();
    const first = create(board, { slides: [{ layout: "title", title: "One" }] }).ids[0];
    const second = create(board, { slides: [{ layout: "title", title: "Two" }] }).ids[0];
    const rect = (id: string) => (board.blocks[id].transform as { override: { x: number; y: number; w: number; h: number } }).override;
    const a = rect(first);
    const b = rect(second);
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    expect(overlap).toBe(false);
    expect(a.w).toBeGreaterThanOrEqual(480);
    const placed = create(board, { afterBlockId: first, slides: [{ layout: "title", title: "Three" }] }).ids[0];
    expect(rect(placed).x).toBeGreaterThanOrEqual(a.x + a.w);
    expect(board.blockOrder).toEqual([first, second, placed]);
  });

  it("escapes every text field and refuses unsafe image urls", () => {
    const board = emptyBoard();
    const evil = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    const id = create(board, {
      slides: [
        { layout: "title", title: evil, subtitle: evil },
        { layout: "stats", title: evil, items: [{ value: evil, label: evil }, { value: "2", label: "b" }] },
        { layout: "quote", text: evil, author: evil },
        { layout: "comparison", title: evil, leftTitle: evil, rightTitle: evil, left: [evil], right: [evil] },
        { layout: "process", title: "p", steps: [evil, "b"] },
        { layout: "image-caption", title: "i", imageUrl: "javascript:alert(1)", caption: evil },
        { layout: "image-caption", title: "i", imageUrl: "https://example.com/a\\b.png", caption: "c" },
      ],
    }).ids[0];
    const data = reload(board, id);
    for (const slideId of data.slideOrder) {
      const html = data.slides[slideId].html;
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<img[^>]*onerror/i);
      expect(html).not.toContain("javascript:");
    }
    expect(data.slides[data.slideOrder[0]].html).toContain("&lt;script&gt;");
    expect(data.slides[data.slideOrder[5]].html).not.toContain("<img");
    expect(data.slides[data.slideOrder[6]].html).not.toContain("<img");
  });

  it("does not reject legitimate text that merely looks like a placeholder", () => {
    const ok = ["How to insert a card", "SQL INSERT INTO t", "Chapter XX", "Use arr[i] here", "[x] done", "Q3 [sic]", "Ref [Smith 2020]", "Version 2 [beta]", "[ghi chu] note", "XXL sizes", "tbd later"];
    for (const text of ok) expect(findPlaceholder([text]), text).toBeUndefined();
    for (const text of ["[Company name]", "[insert figure]", "Revenue: [Q3 revenue]", "Growth XX%", "$XX million", "TBD", "lorem ipsum dolor"]) expect(findPlaceholder([text]), text).toBeDefined();
  });
});
