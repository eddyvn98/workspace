// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { DocLineId } from "@/app/workspace/extensions/docLineId";
import { createDocLineOperations } from "@/app/workspace/utils/docLineOperations";
import { docLineAtPosition, docLineElement, docLineLink, findDocLine } from "@/app/workspace/utils/docLineTargets";

const editors: Editor[] = [];
afterEach(() => { editors.forEach((editor) => editor.destroy()); editors.length = 0; });
async function makeEditor(content: string) {
  const editor = new Editor({ extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), TableKit.configure({ table: { resizable: false } }), DocLineId], content });
  editors.push(editor);
  await new Promise<void>((resolve) => editor.on("create", () => resolve()));
  return editor;
}

describe("document semantic line operations", () => {
  it("initializes item IDs without creating inner paragraph targets", async () => {
    const editor = await makeEditor("<ul><li><p>One</p><ul><li><p>Nested</p></li></ul></li><li><p>Two</p></li></ul>");
    const first = editor.state.doc.firstChild!.firstChild!;
    expect(first.attrs.lineId).toBeTruthy();
    expect(first.firstChild!.attrs.lineId).toBeNull();
    const target = docLineAtPosition(editor.state.doc, 3)!;
    expect(target.node.type.name).toBe("listItem");
    expect(target.node.attrs.lineId).toBe(first.attrs.lineId);
    const ids: string[] = [];
    editor.state.doc.descendants((node) => { if (node.attrs.lineId) ids.push(node.attrs.lineId); });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("duplicates, moves and deletes entire list items when addressed by a legacy inner ID", async () => {
    const editor = await makeEditor('<ul><li data-line-id="one"><p data-line-id="old-inner">One</p></li><li data-line-id="two"><p>Two</p></li></ul>');
    const actions = createDocLineOperations(editor);
    expect(findDocLine(editor.state.doc, "old-inner")?.node.type.name).toBe("listItem");
    actions.duplicate("old-inner");
    expect(editor.state.doc.firstChild!.childCount).toBe(3);
    expect(editor.state.doc.firstChild!.child(0).attrs.lineId).toBe("one");
    expect(editor.state.doc.firstChild!.child(1).attrs.lineId).not.toBe("one");
    actions.moveDown("old-inner");
    expect(editor.state.doc.firstChild!.child(1).attrs.lineId).toBe("one");
    actions.remove("old-inner");
    expect(editor.state.doc.firstChild!.childCount).toBe(2);
    expect(editor.getText()).toContain("Two");
    expect(findDocLine(editor.state.doc, "one")).toBeNull();
  });

  it("converts a task item without changing its sibling", async () => {
    const editor = await makeEditor('<ul data-type="taskList"><li data-type="taskItem" data-line-id="task" data-checked="true"><p data-line-id="inner">Do this</p></li><li data-type="taskItem" data-line-id="other" data-checked="false"><p>Keep this</p></li></ul>');
    expect(findDocLine(editor.state.doc, "inner")?.node.type.name).toBe("taskItem");
    createDocLineOperations(editor).turnInto("inner", "heading2");
    expect(editor.getHTML()).toMatch(/<h2[^>]*>Do this<\/h2>/);
    expect(editor.getHTML()).toContain('data-type="taskItem"');
    expect(findDocLine(editor.state.doc, "other")?.node.textContent).toBe("Keep this");
  });

  it("keeps the original link ID when a duplicate is inserted before its owner", async () => {
    const editor = await makeEditor('<p data-line-id="original">Same text</p><p>Other</p>');
    editor.view.dispatch(editor.state.tr.insert(0, editor.state.doc.firstChild!));
    expect(editor.state.doc.child(0).attrs.lineId).not.toBe("original");
    expect(editor.state.doc.child(1).attrs.lineId).toBe("original");
  });

  it("does not stamp remote collaborative transactions with fresh local line IDs", async () => {
    const editor = await makeEditor('<p data-line-id="original">Original</p>');
    const paragraph = editor.schema.nodes.paragraph.create(null, editor.schema.text("Remote"));
    editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, paragraph).setMeta(ySyncPluginKey, { isChangeOrigin: true }));
    expect(editor.state.doc.lastChild!.attrs.lineId).toBeNull();
    expect(editor.state.doc.firstChild!.attrs.lineId).toBe("original");
  });

  it("keeps table cells valid when deleting their only line and blocks readonly mutations", async () => {
    const editor = await makeEditor('<table><tbody><tr><td><p data-line-id="cell">Delete me</p></td><td><p>Keep me</p></td></tr></tbody></table>');
    const actions = createDocLineOperations(editor);
    actions.remove("cell");
    const table = editor.state.doc.firstChild!;
    expect(table.firstChild!.childCount).toBe(2);
    expect(table.firstChild!.firstChild!.firstChild!.type.name).toBe("paragraph");
    expect(editor.getText()).not.toContain("Delete me");
    const before = editor.getHTML(); editor.setEditable(false);
    expect(actions.duplicate(table.firstChild!.child(1).firstChild!.attrs.lineId)).toBe(false);
    expect(editor.getHTML()).toBe(before);
  });

  it("creates canonical links from Office or legacy routes and safely finds arbitrary IDs", () => {
    for (const source of ["https://app.example/workspace/office/editor?docId=x", "https://app.example/workspace/doc-editor?id=x"]) {
      const url = new URL(docLineLink(source, "board & one", "doc/1", 'line"2')!);
      expect(url.pathname).toBe("/workspace");
      expect(url.searchParams.get("id")).toBe("board & one");
      expect(url.searchParams.get("focusBlock")).toBe("doc/1");
      expect(url.searchParams.get("focusLine")).toBe('line"2');
      expect(url.searchParams.has("docId")).toBe(false);
    }
    const container = document.createElement("div"), paragraph = document.createElement("p");
    paragraph.setAttribute("data-line-id", 'odd"[id]'); container.append(paragraph);
    expect(docLineElement(container, 'odd"[id]')).toBe(paragraph);
  });
});
