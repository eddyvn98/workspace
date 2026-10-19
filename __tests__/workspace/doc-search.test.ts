// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createDocSearchPlugin, DocSearchPluginKey, findDocMatches, getDocCounts, getDocOutline, replaceDocMatches } from "@/app/workspace/utils/workspaceDocSearch";

const editors: Editor[] = [];
function createEditor(content: string) {
  const editor = new Editor({ extensions: [StarterKit], content });
  editors.push(editor);
  return editor;
}
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); });

describe("document find and replace", () => {
  it("finds across formatting runs while respecting paragraph and hard-break boundaries", () => {
    const editor = createEditor("<p><strong>hel</strong>lo</p><p>hello<br>world</p><p>world</p>");
    const matches = findDocMatches(editor.state.doc, "hello");
    expect(matches).toHaveLength(2);
    for (const match of matches) expect(editor.state.doc.textBetween(match.from, match.to)).toBe("hello");
    expect(findDocMatches(editor.state.doc, "helloworld")).toHaveLength(0);
  });

  it("treats regex characters as literal text and preserves Unicode match positions", () => {
    const editor = createEditor("<p>[a+b] VIỆT việt 😀</p>");
    expect(findDocMatches(editor.state.doc, "[a+b]")).toHaveLength(1);
    expect(findDocMatches(editor.state.doc, "việt")).toHaveLength(2);
    expect(findDocMatches(editor.state.doc, "việt", true)).toHaveLength(1);
    const [emoji] = findDocMatches(editor.state.doc, "😀");
    expect(emoji.to - emoji.from).toBe(2);
  });

  it("replaces all with literal text in one undo step and retains surrounding marks", () => {
    const editor = createEditor("<p><strong>old</strong> and old</p>");
    const original = editor.getHTML();
    expect(replaceDocMatches(editor, findDocMatches(editor.state.doc, "old"), "<new>")).toBe(2);
    expect(editor.getText()).toBe("<new> and <new>");
    expect(editor.getHTML()).toContain("<strong>&lt;new&gt;</strong>");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getHTML()).toBe(original);
  });

  it("rejects stale matches and read-only replacements without changing content", () => {
    const editor = createEditor("<p>original</p>");
    const stale = findDocMatches(editor.state.doc, "original");
    editor.commands.insertContentAt(1, "X");
    const before = editor.getHTML();
    expect(replaceDocMatches(editor, stale, "changed")).toBe(0);
    expect(editor.getHTML()).toBe(before);
    editor.setEditable(false);
    expect(replaceDocMatches(editor, findDocMatches(editor.state.doc, "original"), "changed")).toBe(0);
    expect(editor.getHTML()).toBe(before);
  });

  it("uses decorations for highlights so search state never changes saved HTML", () => {
    const editor = createEditor("<p>Find this phrase</p>");
    const before = editor.getHTML();
    editor.registerPlugin(createDocSearchPlugin());
    editor.view.dispatch(editor.state.tr.setMeta(DocSearchPluginKey, { matches: findDocMatches(editor.state.doc, "phrase"), active: 0 }));
    expect(DocSearchPluginKey.getState(editor.state)?.find()).toHaveLength(1);
    expect(editor.getHTML()).toBe(before);
    editor.unregisterPlugin(DocSearchPluginKey);
  });

  it("collects outline positions and Unicode-aware character counts", () => {
    const editor = createEditor("<h1>Plan</h1><h2>Details</h2><p>😀</p>");
    expect(getDocOutline(editor.state.doc).map(({ level, title }) => ({ level, title }))).toEqual([{ level: 1, title: "Plan" }, { level: 2, title: "Details" }]);
    expect(getDocCounts(editor.state.doc)).toEqual({ words: 3, characters: 14 });
  });
});
