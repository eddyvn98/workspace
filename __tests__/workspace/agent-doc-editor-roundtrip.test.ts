// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { DocLineId } from "@/app/workspace/extensions/docLineId";
import { DocImage } from "@/app/workspace/extensions/docImage";
import { DocWorkspaceTable } from "@/app/workspace/extensions/docWorkspaceTable";
import { applyAgentAction, type AgentBoardState } from "@/app/api/workspaces/[id]/agent/operations";

// Same schema extensions as WorkspaceDocRichEditor.tsx (UI-only plugins omitted).
function roundTrip(html: string): string {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      TaskList, TaskItem.configure({ nested: true }),
      TextAlign.configure({ types: ["paragraph", "heading", "listItem", "blockquote"] }),
      TableKit.configure({ table: { resizable: false } }),
      DocLineId, DocImage, DocWorkspaceTable,
    ],
    content: html,
  });
  const out = editor.getHTML();
  editor.destroy();
  return out;
}

function board(html: string): AgentBoardState {
  return { title: "t", blockOrder: ["doc"], connectors: {}, blocks: { doc: { id: "doc", type: "doc", data: { html } } } };
}

describe("agent doc html survives the real editor schema", () => {
  it("keeps text-align on paragraphs, headings, list items and quotes", () => {
    const state = board("");
    applyAgentAction(state, {
      type: "update_node", blockId: "doc",
      html: '<h1 style="text-align:center">T</h1><p style="text-align:right">r</p><p style="text-align:justify">j</p><blockquote style="text-align:center"><p>q</p></blockquote><ul><li style="text-align:right"><p>li</p></li></ul><p style="color:red">c</p>',
    });
    const out = roundTrip(String(state.blocks.doc.data.html));
    expect(out).toMatch(/<h1[^>]*style="text-align: center;?"[^>]*>T<\/h1>/);
    expect(out).toMatch(/<p[^>]*style="text-align: right;?"[^>]*>r<\/p>/);
    expect(out).toMatch(/<p[^>]*style="text-align: justify;?"[^>]*>j<\/p>/);
    expect(out).toMatch(/<blockquote[^>]*style="text-align: center;?"/);
    expect(out).toMatch(/<li[^>]*style="text-align: right;?"/);
    expect(out).not.toContain("color");
  });

  it("renders markdown (nested lists, hr, code, table, tasks) into nodes the editor keeps", () => {
    const state = board("");
    applyAgentAction(state, { type: "update_node", blockId: "doc", markdown: "# H\n\n1. a\n   - b\n\n---\n\n```\ncode\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] done" });
    const out = roundTrip(String(state.blocks.doc.data.html));
    expect(out).toContain("<ol><li");
    expect(out).toContain("<ul><li");
    expect(out).toContain("<hr>");
    expect(out).toContain("<pre><code>code</code></pre>");
    expect(out).toMatch(/<table[\s\S]*<th[\s\S]*A[\s\S]*<td[\s\S]*1/);
    expect(out).toContain('data-type="taskItem"');
    expect(out).toContain('data-checked="true"');
  });

  it("keeps ordered list start numbers", () => {
    const state = board("");
    applyAgentAction(state, { type: "update_node", blockId: "doc", markdown: "5. five\n6. six" });
    expect(roundTrip(String(state.blocks.doc.data.html))).toContain('<ol start="5">');
  });

  it("keeps embedded workspace tables and lineIds through an agent edit and an editor reload", () => {
    const state = board('<h2 data-line-id="h">Data</h2><p data-line-id="p1">One</p>');
    state.blocks.t = { id: "t", type: "table", data: { rows: 1, cols: 1, cells: [["x"]] } };
    expect(applyAgentAction(state, { type: "embed_table_in_doc", docId: "doc", tableId: "t" }).ids).toEqual(["doc", "t"]);
    const first = roundTrip(String(state.blocks.doc.data.html));
    expect(first).toContain('data-table-id="t"');
    expect(first).toContain('data-line-id="p1"');
    state.blocks.doc.data.html = first;
    applyAgentAction(state, { type: "update_rich_text", blockId: "doc", mode: "append", markdown: "Two" });
    const second = roundTrip(String(state.blocks.doc.data.html));
    expect(second).toContain('data-line-id="p1"');
    expect(second).toContain('data-line-id="h"');
    expect(second.match(/data-workspace-table/g)).toHaveLength(1);
    expect(second).toContain("Two");
  });
});
