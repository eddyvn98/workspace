// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/react";
import { documentSchemaExtensions } from "@/lib/workspace/document-schema";
import { workspaceDocCommands } from "@/app/workspace/utils/workspaceDocCommands";
import { computeActiveMarks } from "@/app/workspace/utils/workspaceDocEditorHelpers";
import { closeDocSlashMenu, createDocSlashCommand, DocSlashPluginKey } from "@/app/workspace/extensions/docSlashCommand";

const editors: Editor[] = [];
beforeEach(() => vi.stubGlobal("requestAnimationFrame", () => 0));
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); vi.unstubAllGlobals(); });
function createEditor(content = "<p>Document text</p>") {
  const editor = new Editor({ extensions: documentSchemaExtensions, content });
  editors.push(editor);
  editor.commands.setTextSelection({ from: 1, to: editor.state.doc.firstChild!.nodeSize - 1 });
  return editor;
}

describe("shared Document formatting integration", () => {
  it("retains typography and highlight through serialization, with matching toolbar state", () => {
    const editor = createEditor(), commands = workspaceDocCommands(editor);
    commands.setFontFamily?.("Georgia, serif"); commands.setFontSize?.("24px");
    commands.setTextColor?.("#dc2626"); commands.setHighlightColor?.("#fef08a"); commands.setLineHeight?.("1.75");
    const marks = computeActiveMarks(editor);
    expect(marks).toMatchObject({ fontFamily: "Georgia, serif", fontSize: "24px", lineHeight: "1.75", canUndo: true });
    const restored = createEditor(editor.getHTML());
    expect(restored.getHTML()).toBe(editor.getHTML());
    expect(restored.getText()).toBe("Document text");
    expect(restored.isActive("highlight")).toBe(true);
    expect(restored.getAttributes("textStyle").color).toBeTruthy();
  });

  it("clears marks and block alignment without discarding text and can undo the operation", () => {
    const editor = createEditor('<h2 style="text-align:center"><strong><span style="font-size:24px;line-height:2">Keep this text</span></strong></h2>');
    const previous = editor.getHTML(), commands = workspaceDocCommands(editor);
    commands.clearFormatting?.();
    const cleared = editor.getHTML();
    expect(cleared).toContain("<p>Keep this text</p>");
    expect(cleared).not.toMatch(/<h2|<strong|<span|style=/);
    commands.undo?.(); expect(editor.getHTML()).toBe(previous);
    expect(computeActiveMarks(editor).canRedo).toBe(true);
    commands.redo?.(); expect(editor.getHTML()).toBe(cleared);
  });

  it("supports code blocks, dividers and editable native table operations in the same schema", () => {
    const editor = createEditor(), commands = workspaceDocCommands(editor);
    commands.toggleCodeBlock?.(); expect(computeActiveMarks(editor).codeBlock).toBe(true);
    commands.toggleCodeBlock?.(); editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    commands.insertHorizontalRule?.(); expect(editor.getHTML()).toContain("<hr>");
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    expect(editor.can().addRowAfter()).toBe(true); editor.commands.addRowAfter();
    expect(editor.getHTML().match(/<tr>/g)).toHaveLength(3);
    expect(editor.can().deleteTable()).toBe(true); editor.commands.deleteTable();
    expect(editor.getText()).toContain("Document text"); expect(editor.getHTML()).not.toContain("<table");
  });

  it("dismisses the slash suggestion before the editor's outer Escape action", async () => {
    const state = vi.fn();
    const editor = new Editor({ extensions: [...documentSchemaExtensions, createDocSlashCommand(state, vi.fn())], content: "<p></p>" });
    editors.push(editor); editor.commands.insertContent("/");
    await vi.waitFor(() => expect(DocSlashPluginKey.getState(editor.state)?.active).toBe(true));
    expect(closeDocSlashMenu(editor)).toBe(true);
    expect(DocSlashPluginKey.getState(editor.state)?.active).toBe(false);
    expect(closeDocSlashMenu(editor)).toBe(false);
    expect(editor.getText()).toBe("/");
  });
});
